require('dotenv').config();
const path = require('path');
const ws = require('ws');
const {FaxWatcher} = require('./faxWatcher');

const faxPath = process.env.FAXPATH;
const copyPath = process.env.COPYPATH;
const printerList = [
    {id: 1, name: 'Canon C2230', floor: '2F', path: path.join(faxPath, '2F_C2230')},
    {id: 2, name: 'XeroX C4475', floor: '2F', path: path.join(faxPath, '2F_C4475')},
    {id: 3, name: 'XeroX C3373', floor: '3F', path: path.join(faxPath, '3F_C3373')},
    {id: 4, name: 'Muratec C3090', floor: '4F', path: path.join(faxPath, '4F_C3090')},
];

const createSimpleFaxData = fax => {
    const printer = printerList.find(p => p.path == fax.dir);
    return {
        name: fax.fileName,
        path: fax.path,
        hash: fax.hash,
        time: fax.cDate.toString(),
        floor: printer?.floor,
        printerName: printer.name,
        printerId: printer.id,
    }
};

const watcher = new FaxWatcher(printerList, copyPath);
watcher.on('error', e => console.trace(e));

const server = new ws.Server({
    port: 5050,
    clientTracking: true,
});
server.on('connection', ws => {
    ws.on('message', message => {
        const receiveData = JSON.parse(message);

        switch (receiveData?.event) {
            case 'getAll':
                ws.send(JSON.stringify({
                    event: 'getAll',
                    data: watcher.getAllFax().map(fax => createSimpleFaxData(fax))
                }));
                break;
            case 'getPrinter':
                ws.send(JSON.stringify({
                    event: 'getPrinter',
                    data: printerList,
                }));
                break;
        }
    });

    ws.on('close', () => {});
});

watcher.on('create', fax => {
    const sendData = {
        event: 'create',
        data: createSimpleFaxData(fax)
    };
    const sendDataStr = JSON.stringify(sendData);
    server.clients.forEach( ws => ws.send(sendDataStr));
});

watcher.on('rename', fax => {
    const sendData = {
        event: 'rename',
        data: createSimpleFaxData(fax)
    };
    const sendDataStr = JSON.stringify(sendData);
    server.clients.forEach( ws => ws.send(sendDataStr));
});

watcher.on('delete', fax => {
    const sendData = {
        event: 'delete',
        data: createSimpleFaxData(fax)
    };
    const sendDataStr = JSON.stringify(sendData);
    server.clients.forEach( ws => ws.send(sendDataStr));
});