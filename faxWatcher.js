const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {cdate} = require("cdate");
const chokidar = require("chokidar");

class FAX {
    constructor(filepath, stats) {
        this.path = filepath;
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

    toString() {
        return JSON.stringify({
            path: this.path,
            hash: this.hash,
            time: this.cdate.getTime(),
        });
    }
}

class FaxWatcher extends EventEmitter {
    #faxList
    /**
     * @param {Array<string|{name: string,floar: string, path: string}>} printerList 
     * @param {string} copyPath 
     */
    constructor(printerList = [], copyPath,isLog = true) {
        super();
        /** @type {Map<string, FAX>} */
        this.#faxList = new Map();
        this.printerList = printerList.map(p => typeof p == 'string' ? {path: p} : p);
        this.copyPath = copyPath;
        this.isLog = isLog;

        this.watcher = chokidar.watch(
            this.printerList.map(p => p.path),
            {
                depth: 0,
                awaitWriteFinish: true,
                awaitWriteFinish: {
                    stabilityThreshold: 5000,
                    pollInterval: 1000,
                },
                // usePolling: true
                followSymlinks:false,
                alwaysStat: true,
        });

        this.watcher.on('error', e => this.emit('error', e));

        this.watcher.on('add', async (filepath, stats) => {
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

        this.watcher.on('change', async (filepath, stats) => {
            if(!this.#isPdfPath(filepath)) return;
            
            let fax = new FAX(filepath, stats);
            this.#faxList.set(await fax.createHash(), fax);
            this.#log('change', fax);
            this.emit('change', fax);
        });

        this.watcher.on('unlink', filepath => {
            if(!this.#isPdfPath(filepath)) return;
        
            let fax = new FAX(filepath);
            for(const [,_fax] of this.#faxList.entries()) {
                if(_fax.path == fax.path) {
                    _fax.unlink = true;
                    const hash = _fax.hash;
                    setTimeout(() => {
                        fax = this.#faxList.get(hash);
                        if(fax != null && fax?.unlink) { /** deletePDF */
                            this.#faxList.delete(hash);
                            this.#log('delete', fax);
                            this.emit('delete', fax);
                        }
                    }, 6000);
                    break;
                }
            }
        });
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
        await fs.promises.copyFile(fax.path, filepath);
        this.emit('copy', fax, filepath);
    }

    /**
     * @param {'create'|'change'|'delete'|'rename'} event 
     * @param {FAX} fax 
     */
    #log(event, fax) {
        if(!this.isLog) return;

        let eventColor = '';
        if(event == 'create') eventColor = '\x1b[32m';
        else if(event == 'delete') eventColor = '\x1b[31m';
    
        console.log(`${cdate().text('%m/%d %Hh%Mm%Sss')} ${eventColor + event}\x1b[0m ${fax.lastFolderName} ${fax.fileName}`);
        if(event != 'delete') {
            console.log(`    ctime:${cdate(fax.cDate).format('MM/DD HH:mm:ss')} mtime:${cdate(fax.mDate).format('MM/DD HH:mm:ss')}`);
            // console.log(`    ${fax.hash}`);
        }
    }

    /**
     * @returns {Array<FAX>}
     */
    getAllFax() {
        return Array.from(this.#faxList.values());
    }
}

module.exports = {FaxWatcher, FAX};