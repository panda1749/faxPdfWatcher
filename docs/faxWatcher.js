class FaxWatcher extends WebSocket {

    constructor(url = location.origin.replace('http', 'ws'), protocols) {
        super(url, protocols);
        this.addEventListener('message', e => {
            try {
                const data = JSON.parse(e.data);
                if(data.event != null && data.data != null) {
                    this.dispatchEvent(new FaxEvent(data.event, data.data));
                }
            } catch (error) {
                
            }
        });
    }

    on(type, listener, options) {
        super.addEventListener(type, listener, options);
        return this;
    }

    off(type, listener, options) {
        super.removeEventListener(type, listener, options);
        return this;
    }

    send(data) {
        if(typeof data == 'string') data = {event: data};
        super.send(JSON.stringify(data));
    }
    /**
     * @param {string} event 
     * @param {Function} callback 
     */
    get(event, callback) {
        /**
         * @param {FaxEvent} e 
         */
        const listener = e => {
            callback(e);
            this.removeEventListener(event, listener);
        };
        this.addEventListener(event, listener);
        this.send(event);
        return listener;
    }
}

class FaxEvent extends Event {
    constructor(type, data) {
        super(type);
        this.data = data;
    }
}

export { FaxWatcher };