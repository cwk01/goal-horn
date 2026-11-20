// A small Server-Sent Events reader over XMLHttpRequest. React Native's fetch can't
// stream a response body, but its XHR hands over the text as it arrives.
export type SseHandler = (event: string, data: any) => void;

export class EventStream {
  private xhr: XMLHttpRequest | null = null;
  private seen = 0;
  private buf = '';
  private closed = false;
  private lastData = Date.now();
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(
    private url: string,
    private onEvent: SseHandler,
    private onOpen: () => void,
    private onDrop: (why: string) => void,
  ) {}

  open() {
    this.closed = false;
    const xhr = new XMLHttpRequest();
    this.xhr = xhr;
    this.seen = 0;
    this.buf = '';
    this.lastData = Date.now();
    let opened = false;
    xhr.open('GET', this.url);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Cache-Control', 'no-store');
    const read = () => {
      if (xhr !== this.xhr) return;
      if (!opened && xhr.readyState >= 2 && xhr.status === 200) { opened = true; this.onOpen(); }
      const text = xhr.responseText || '';
      if (text.length > this.seen) {
        this.lastData = Date.now();
        this.feed(text.slice(this.seen));
        this.seen = text.length;
      }
    };
    xhr.onreadystatechange = () => {
      read();
      if (xhr.readyState === 4 && xhr === this.xhr) this.drop(xhr.status ? 'closed (' + xhr.status + ')' : 'closed');
    };
    xhr.onprogress = read;
    xhr.onerror = () => this.drop('network error');
    xhr.send();
    // The server sends a ping every 20 seconds. Silence for 45 means the link is dead
    // even if the socket hasn't noticed (phone changed Wi-Fi, computer went to sleep).
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => { if (Date.now() - this.lastData > 45000) this.drop('no data for 45s'); }, 5000);
  }

  private feed(chunk: string) {
    this.buf += chunk.replace(/\r\n/g, '\n');
    let i: number;
    while ((i = this.buf.indexOf('\n\n')) >= 0) {
      const block = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (!data.length) continue; // comments and pings
      let parsed: any = data.join('\n');
      try { parsed = JSON.parse(parsed); } catch (e) { /* plain text */ }
      try { this.onEvent(event, parsed); } catch (e) { /* a handler bug shouldn't kill the stream */ }
    }
  }

  private drop(why: string) {
    const was = this.xhr;
    this.cleanup();
    if (was && !this.closed) this.onDrop(why);
  }

  private cleanup() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    const x = this.xhr;
    this.xhr = null;
    if (x) { x.onreadystatechange = null; x.onprogress = null; x.onerror = null; try { x.abort(); } catch (e) { /* done */ } }
  }

  close() {
    this.closed = true;
    this.cleanup();
  }
}
