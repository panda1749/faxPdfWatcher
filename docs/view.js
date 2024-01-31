import { FaxWatcher } from "./faxWatcher.js";

class Counter {
    /** @param {HTMLElement} dom */
    constructor(dom) {
        this.dom = dom;
        this.counter = 0;
    }
    /** @return {number} */
    increment() { 
        this.set(this.counter + 1);
        return this.counter;
    }
    /** @return {number} */
    decrement() { 
        this.set(this.counter - 1);
        return this.counter;
    }
    /** 
     * @param {number} num
     * @return {number}
     */
    set(num) {
        this.dom.innerText = this.counter = num;
        return this.counter;
    }
    /** @return {number} */
    get() { return this.counter; }
}

class Notice {
    constructor(checkbox) {
        /** @type {HTMLElement} */
        this.dom = checkbox;
        this.isInputCheck = this.dom?.type == 'checkbox';

        if(Notification.permission == 'granted') this.setCheck(true);

        if(this.isInputCheck) {
            this.dom.addEventListener('change', e => {
                if(this.isChecked()) {
                    if(Notification.permission != 'granted') {
                        Notification.requestPermission().then(result => {
                            if(result != 'granted') this.setCheck(false);
                        });
                    }
                }
            });
        } else {
            this.dom.addEventListener('click', e => {
                console.log('click',!this.isChecked());
                if(!this.isChecked()) {
                    if(Notification.permission == 'granted') {
                        this.setCheck(true);
                    } else {
                        Notification.requestPermission().then(result => {
                            if(result != 'granted') this.setCheck(false);
                        });
                    }
                } else {
                    this.setCheck(false);
                }
            });
        }
        
        this.notice = null;
    }

    isChecked() {
        if(this.isInputCheck) {
            return this.dom.checked;
        } else {
            return this.dom.classList.contains('on');
        }
    }

    setCheck(bool) {
        if(this.isInputCheck) {
            this.dom.checked = bool;
        } else {
            console.log('setCheck', bool);
            this.dom.classList.toggle('on', bool);
            this.dom.classList.toggle('off', !bool);
        }
    }

    post(event, fax, counter) {
        if(this.isChecked() && Notification.permission == 'granted') {
            this.notice = new Notification('faxWatcher', {
                tag: 'faxWatcher',
                body: `${counter}件 ${dateFormat(fax.time)}`,
                renotify: event == 'create',
                icon: 'fax.svg',
            });
            this.notice.addEventListener('click', Notice.ClickEventListener);
            // this.notice.addEventListener('error', ev => console.log(ev));
        }
    }

    close() { this.notice?.close() }

    static ClickEventListener(ev) { window.focus() }
}

const dateFormat = date => {
    const zeroPad = (v, count) => String(v).padStart(count, '0');
    const d = new Date(date);
    return `${zeroPad(d.getMonth() + 1,2)}/${zeroPad(d.getDate(), 2)} ${zeroPad(d.getHours(), 2)}:${zeroPad(d.getMinutes(), 2)}.${zeroPad(d.getSeconds(), 2)}`;
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
    // div.querySelector('.name').innerText = fax.name;
    div.id = fax.hash;

    const tag = div.querySelector('.tag');
    tag.appendChild(createDom({text: fax.floor}));
    tag.appendChild(createDom({text: fax.printerName}));

    if(!document.hidden) div.classList.add('fadeIn');
    document.getElementsByClassName('list')[0].appendChild(div);
};

const setConnectionState = state => {
    const list = document.getElementsByClassName('list')[0];
    list.classList.remove('live', 'close', 'error');
    list.classList.add(state);
};

const isPopup = window.name == 'faxpopup';

/** @type {Counter} */
let faxCounter = null;
let notice = null;
const ws = new FaxWatcher();
ws.addEventListener('open', e => {
    faxCounter = new Counter(document.getElementById('itemCounter'));
    // notice = new Notice(document.querySelector('input[name=notice]'));
    notice = new Notice(document.getElementById('notice'));
    setConnectionState('live');

    ws.get('getAll', e => {
        e.data.forEach(data => addFax(null, data));
        faxCounter.set(e.data.length);
    });
    ws.get('getPrinter', e => console.log('Printer', e.data));

    let popupWindow = null;
    const popupBtn = document.getElementById('popupBtn');
    popupBtn.addEventListener('click', e => {
        popupWindow = window.open(location.href, 'faxpopup', 'popup,location=no');
    });

    const listDiv = document.getElementsByClassName('list')[0];
    listDiv.addEventListener('click', e => {
        if(e.target?.classList?.contains('item')) {
            console.log(e);
        }
    });
    listDiv.addEventListener('animationend', e => {
        /** @type {DOMTokenList} */
        const classList = e.target.classList;
        if(classList.contains('fadeIn')) {
            classList.remove('fadeIn');
        } else if(classList.contains('fadeOut')) {
            e.target.remove();
        }
    });

    if(isPopup) {
        const popupBtn = document.getElementById('popupBtn');
        popupBtn.style.display = 'none';
    }
});

ws.on('error', e => {
    console.log('ws error',e);
    setConnectionState('error');
})
.on('close', e => setConnectionState('close'))
.on('create', e => {
    addFax(e.type, e.data);
    notice.post(e.type, e.data, faxCounter.increment());
})
.on('delete', e => {
    const item = document.getElementById(e.data.hash);
    if(document.hidden) {
        item.remove();
    } else {
        item?.classList?.add('delete', 'fadeOut');
    }
    const counter = faxCounter.decrement();
    if(counter == 0) {
        notice.close();
    } else {
        notice.post(e.event, e.data, counter);
    }
});


