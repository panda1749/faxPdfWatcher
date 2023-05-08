/**
 * @typedef {object} FAX
 * @property {string} name
 * @property {string} path
 * @property {string} hash
 * @property {string} time
 * @property {string} floor
 * @property {string} printerName
 */

const TEST = true;
const dateFormat = date => {
    const zeroPad = (v, count) => String(v).padStart(count, '0');
    const d = new Date(date);
    return `${zeroPad(d.getMonth() + 1,2)}/${zeroPad(d.getDay(), 2)} ${zeroPad(d.getHours(), 2)}:${zeroPad(d.getMinutes(), 2)}.${zeroPad(d.getSeconds(), 2)}`;
};

const addState = el => {
    document.getElementsByClassName('list')[0].appendChild(el);
};

/**
 * @param {object} param 
 * @param {string} param.tagName
 * @param {string} param.text
 * @param {Array<string>|string} param.className
 * @return {HTMLElement}
 */
const createDom = ({tagName = 'div', text, className = []}) => {
    if(typeof className == 'string') className = [className];

    const d = document.createElement(tagName);
    if(typeof text == 'string') d.innerText = text;
    d.classList.add(...className);
    return d;
};

/**
 * @param {string} event
 * @param {FAX} fax 
 */
const addFax = (event, fax) => {
    /** @type {HTMLDivElement} */
    const div = document.getElementById('faxItem').content.firstElementChild.cloneNode(true);
    div.querySelector('.time').innerText = dateFormat(fax.time);
    div.querySelector('.name').innerText = fax.name;
    div.id = fax.hash;

    const tag = div.querySelector('.tag');
    tag.appendChild(createDom({text: fax.floor}));
    tag.appendChild(createDom({text: fax.printerName}));
    addState(div);
};

const incrementItemCounter = (num = 1) => {
    const itemCounter = document.getElementById('itemCounter');
    itemCounter.innerText = num + parseInt(itemCounter.innerText);
};
const decrementItemCounter = (num = 1) => incrementItemCounter(-1 * num);
const setItemCounter = count => document.getElementById('itemCounter').innerText = count;

const noticeInput = document.querySelector('input[name=notice]');
if(Notification.permission == 'granted') noticeInput.checked = true;
noticeInput.addEventListener('change', e => {
    /** @type {HTMLInputElement} */
    const notice = e.target;
    if(notice.checked) {
        if(Notification.permission != 'granted') {
            Notification.requestPermission().then(result => {
                if(result != 'granted') noticeInput.checked = false;
            });
        }
    }
});
const notice = (event, fax) => {
    if(noticeInput.checked && Notification.permission == 'granted') {
        const n = new Notification(event, {
            tag: event,
            text: fax.name,
        });
        n.addEventListener('error', ev => console.log(ev));
    }
}

const ws = new WebSocket(`ws:192.168.1.${TEST?'2':'202'}:5050`);
ws.addEventListener('open', e => {
    ws.send(JSON.stringify({event: 'getAll'}));
    ws.send(JSON.stringify({event: 'getPrinter'}));
    const list = document.getElementsByClassName('list')[0];
    list.classList.remove('close', 'error');
    list.classList.add('live');

    document.getElementsByClassName('list')[0].addEventListener('click', e => {
        if(e.target?.classList?.contains('item')) {
            console.log(e);
        }
    });
});

ws.addEventListener('error', e => {
    console.log('ws error',e);
    const list = document.getElementsByClassName('list')[0];
    list.classList.remove('live');
    list.classList.add('error');
});
ws.addEventListener('close', e => {
    const list = document.getElementsByClassName('list')[0];
    list.classList.remove('live');
    list.classList.add('close');
});

ws.addEventListener('message', e => {
    /**
     * @type {{event: string, data:{FAX} | Array<FAX>}}
     */
    const sendData = JSON.parse(e.data);
    console.log(dateFormat(new Date()),`event: ${sendData.event}`, sendData.data);

    switch (sendData.event) {
        case 'create':
            addFax(sendData.event, sendData.data);
            incrementItemCounter();
            notice(sendData.event, sendData.data);
            break;
        case 'rename':
            {
                const item = document.getElementById(sendData.data.hash);
                item.querySelector('.name').innerText = sendData.name;
            }
            break;
        case 'delete':
            {
                const item = document.getElementById(sendData.data.hash);
                decrementItemCounter();
                item?.classList?.add('delete');
            }
            break;
        case 'getAll':
            sendData.data.forEach(data => addFax('------', data));
            setItemCounter(sendData.data.length);
            break;
        case 'getPrinter':

        break;
    }

    
})