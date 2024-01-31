const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { setTimeout , setInterval } = require("timers/promises");
const crypto = require('crypto');
const {cdate} = require("cdate");
const chokidar = require("chokidar");

const sleep = waitTime => setTimeout( waitTime ) ;

class FAX {
    constructor(filepath, stats) {
        /** @type {string} */
        this.path = filepath;
        /** @type {string} */
        this.hash = null;
        /** @type {bool} */
        this.unlink = null;

        const pathObj = path.parse(filepath);
        this.fileName = pathObj.base;
        this.dir = pathObj.dir;
        this.lastFolderName = this.dir.split(path.sep).pop();

        if(stats != null) {
            this.cDate = new Date(stats.ctime);
            this.mDate =  new Date(stats.mtime);
        }
    }

    async createHash() {
        const stream = fs.createReadStream(this.path);
        return await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            hash.once('finish', () => {
                this.hash = hash.read().toString('hex');
                resolve(this.hash);
            });
            stream.once('error', err => reject(err));
            stream.pipe(hash);
        })
    }

    isLive() {
        return fs.existsSync(this.path)
    }

    toString() {
        return JSON.stringify({
            path: this.path,
            hash: this.hash,
            time: this.cdate.getTime(),
        });
    }
}

class FaxList extends Map {
    constructor() {
        super();
        this.pathMap = new Map();
    }

    /**
     * @param {string} key 
     * @param {FAX} value 
     */
    set(key, value) {
        super.set(key, value);
        if(value?.path != null) {
            this.pathMap.set(value.path, key);
        }
    }

    getByPath(path) {
        const hash = this.pathMap.get(path);
        if(hash != null) {
            return this.get(hash);
        }
    }

    delete(key) {
        const fax = this.get(key);
        if(fax != null && fax.path != null) {
            this.pathMap.delete(fax.path);
        }
        super.delete(key);
    }
}

class FaxWatcher extends EventEmitter {
    #faxList
    /**
     * @param {Array<string|{name: string,floar: string, path: string}>} printerList 
     * @param {string} copyPath 
     */
    constructor(printerList = [], copyPath,logLv = FaxWatcher.LOG_LV.LOG) {
        super();
        /** @type {Map<string, FAX>} */
        this.#faxList = new FaxList();
        this.printerList = printerList.map(p => typeof p == 'string' ? {path: p} : p);
        this.copyPath = copyPath;
        this.logLv = logLv;
        this.watchOpt = {
            depth: 0,
            awaitWriteFinish: true,
            awaitWriteFinish: {
                stabilityThreshold: 5000,
                pollInterval: 1000,
            },
            // usePolling: true
            followSymlinks:false,
            alwaysStat: true,
            // atomic: true,
        };
        this.status = 'connecting';

        this.watcher = this.getFSWatcher();

        
    }

    checkPrinterPath() {
        return this.printerList.every(p => fs.existsSync(p.path));
    }

    async connect(opt) {
        this.status = 'CONNECTING';
        if(opt != 'test' && this.checkPrinterPath()) {
            return this.getFSWatcher();
        } else {
            await sleep(10000);
            console.log(new Date(), 'RE CONNECT');
            if(this.checkPrinterPath()) {
                return this.getFSWatcher();
            } else {
                return await this.connect('test');
            }
        }
    }

    getFSWatcher() {
        const w = chokidar.watch(
            this.printerList.map(p => p.path),
            this.watchOpt,
        );

        w.on('error', async e => {
            if(e.code == 'ECONNRESET' || e.code == 'ENETUNREACH') {
                this.emit('error', e);
                if(this.status != e.code) {
                    this.status = e.code;
                    console.log(new Date(), e.code);
                    await this.watcher.close();
                    this.#faxList.clear();

                    this.watcher = await this.connect('test');
                } 
            } else {
                this.emit('error', e);
            }
        });

        w.on('warning', async (code, fax) => {
            this.#errLog('warning', code, fax);
        });

        w.on('add', async (filepath, stats) => {
            if(!this.#isPdfPath(filepath)) return;
        
            let fax = new FAX(filepath, stats);
            if(this.#faxList.has(await fax.createHash())) { /** renamePDF */
                this.#faxList.set(fax.hash, fax);
                this.#log('rename', fax);
                this.emit('rename', fax);
            }else { /** addPDF */
                this.#faxList.set(fax.hash, fax);
                this.#log('create', fax);
                this.emit('create', fax);
                this.#copy(fax);
            }
        });

        w.on('change', async (filepath, stats) => {
            if(!this.#isPdfPath(filepath)) return;
            
            let fax = new FAX(filepath, stats);

            const oldFax = this.#faxList.getByPath(fax.path);
            if(oldFax != null) this.#faxList.delete(oldFax.hash);

            this.#faxList.set(await fax.createHash(), fax);
            this.#log('change', fax);
            this.emit('change', fax);
        });

        w.on('unlink', async filepath => {
            if(!this.#isPdfPath(filepath)) return;
        
            const oldFax = this.#faxList.getByPath(filepath);
            if(oldFax == null) return this.emit('error', {code: 'unlink FAX Object None'});
            
            oldFax.unlink = true;
            const hash = oldFax.hash;
            const filePath = oldFax.path;
            await sleep(6000);
            const fax = this.#faxList.get(hash) || this.#faxList.getByPath(filePath);
            
            if(fax != null && fax?.unlink) { /** deletePDF */
                this.#faxList.delete(hash);
                this.#log('delete', fax);
                this.emit('delete', fax);
            }
            
            // if(oldFax != null) {
            //     oldFax.unlink = true;
            //     const hash = oldFax.hash;
            //     setTimeout(() => {
            //         const fax = this.#faxList.get(hash);
            //         console.log('deleteCheck',fax != null && fax?.unlink, fax);
            //         if(fax != null && fax?.unlink) { /** deletePDF */
            //             this.#faxList.delete(hash);
            //             this.#log('delete', fax);
            //             this.emit('delete', fax);
            //         }
            //     }, 6000);
            // }
        });

        return w;
    }

    /**
     * @param {string} filepath 
     * @returns bool
     */
    #isPdfPath(filepath) {return path.extname(filepath) == '.pdf'}

    /**
     * @param {FAX} fax 
     */
    async #copy(fax) {
        if(this.copyPath == null) return;
        //2013-04-27 08h53m00ss 3F fileName
        const floor = this.printerList.find(p => p.path == fax.dir)?.floor;
        const fileName = `${cdate(fax.cDate.getTime() > fax.mDate.getTime() ? fax.mDate : fax.cDate).text('%Y-%m-%d %Hh%Mm%Sss')} ${floor||'-'} ${fax.fileName}`;
        const filepath = path.join(this.copyPath, fileName);
        //await fs.promises.copyFile(fax.path, filepath);
        //this.emit('copy', fax, filepath);
        return fs.promises.copyFile(fax.path, filepath)
        .catch(e => {
            this.emit('warning',FaxWatcher.ERRCODE.FILE_NOT_EXIST, fax);
            console.log(e);
        })
        .then(v => this.emit('copy', fax, filepath));
    }

    #errLog(lv, code, fax) {
        let eventColor = '';
        if(lv == 'warning') eventColor = '\x1b[33m';
        else if(lv == 'error') eventColor = '\x1b[31m';

        console.log(`${cdate().text('%m/%d %Hh%Mm%Sss')} ${eventColor + lv} ${code}\x1b[0m ${fax?.fileName}`);
    }

    /**
     * @param {'create'|'change'|'delete'|'rename'} event 
     * @param {FAX} fax 
     */
    #log(event, fax, ...args) {
        if(this.logLv == FaxWatcher.LOG_LV.NONE) return ;

        if(this.logLv == FaxWatcher.LOG_LV.DEBUG) {
            if(event == 'debug') {
                console.log(fax, ...args);
                return;
            }
        }

        if(this.logLv <= FaxWatcher.LOG_LV.LOG) {
            let eventColor = '';
            if(event == 'create') eventColor = '\x1b[32m';
            else if(event == 'delete') eventColor = '\x1b[31m';
        
            console.log(`${cdate().text('%m/%d %Hh%Mm%Sss')} ${eventColor + event}\x1b[0m ${fax.lastFolderName} ${fax.fileName}`);
            if(event != 'delete') {
                console.log(`    ctime:${cdate(fax.cDate).format('MM/DD HH:mm:ss')} mtime:${cdate(fax.mDate).format('MM/DD HH:mm:ss')}`);
                // console.log(`    ${fax.hash}`);
            }
        }
    }

    /**
     * @returns {Array<FAX>}
     */
    getAllFax() {
        return Array.from(this.#faxList.values());
    }

    static LOG_LV = {
        DEBUG: 0,
        LOG: 1,
        WARNING: 2,
        ERROR: 3,
        NONE: 4,
    }

    static ERRCODE = {
        FILE_NOT_EXIST:'File does not exist',
    }
}

module.exports = {FaxWatcher, FAX};
// export {FaxWatcher, FAX};