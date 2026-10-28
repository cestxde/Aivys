/**
 * The app's player on Android, given to the page by the activity
 * (`NativePlayer.kt`); null elsewhere. The WebView there cannot stream local
 * files and stops in the background, so tracks play in the app's ExoPlayer.
 */
interface AndroidPlayer {
    /** JSON `PlayingState`: what plays already (the app reopened while its music went on). */
    state(): string;
    load(path: string, startAt: number): void;
    play(): void;
    pause(): void;
    seek(seconds: number): void;
    setVolume(volume: number): void;
    unload(): void;
    /** JSON `{title, artist, album, cover}` for the system's media controls. */
    setMetadata(json: string): void;
}

const bridge = (window as unknown as { AivysPlayer?: AndroidPlayer }).AivysPlayer ?? null;

/** What the native player tells the page (seconds throughout). */
type PlayerEvent =
    | { type: "loaded"; duration: number }
    | { type: "play" | "pause" | "ended" | "next" | "previous" }
    | { type: "time" | "seeked"; position: number }
    | { type: "error"; message: string };

/** What the native player has loaded, and where it is. */
interface PlayingState {
    path: string | null;
    position: number;
    duration: number | null;
    playing: boolean;
}

/** What the system's media controls show for the loaded track. */
export interface NowPlaying {
    title: string;
    artist: string | null;
    album: string | null;
    /** Path of the cover image. */
    cover: string | null;
}

/** The file path an asset URL (`convertFileSrc`, maybe with `?v=`) points at. */
const pathOf = (url: string): string => decodeURIComponent(new URL(url).pathname.slice(1));

/**
 * An `HTMLAudioElement` look-alike over the native player: the part of it the
 * app uses (`src`, `currentTime`, `duration`, `paused`, `volume`, `play`,
 * `pause`, `load`, `removeAttribute("src")` and the media events), so the
 * rest of the app plays the same on Android as on the desktop. Also fires
 * `nexttrack` / `previoustrack` for those buttons of the system's controls.
 *
 * The music outlives the page (the app swiped away from the recent apps): a
 * new page's first load of the track that still plays takes it over where it
 * is, rather than loading it again.
 */
export class NativeAudio extends EventTarget {
    private readonly player: AndroidPlayer;
    private url = "";
    private time = 0;
    private length = NaN;
    private stopped = true;
    private level = 1;
    // Settles the promise of play(): on playing, or on an error of the load.
    private starting: { resolve: () => void; reject: (e: Error) => void } | null = null;
    error: { code: number; message: string } | null = null;
    // What played before this page; its first load of that track takes it over.
    private playingBefore: PlayingState | null;
    // Taking it over: the app's seeks to where it saved the position are not made.
    private adopting = false;

    constructor(player: AndroidPlayer) {
        super();
        this.player = player;
        try {
            const state = JSON.parse(player.state()) as PlayingState;
            this.playingBefore = state.path ? state : null;
        } catch {
            this.playingBefore = null;
        }
        window.addEventListener("aivys-player", (e) => this.receive((e as CustomEvent<PlayerEvent>).detail));
    }

    get src() {
        return this.url;
    }

    set src(url: string) {
        this.url = url;
    }

    get currentTime() {
        return this.time;
    }

    set currentTime(seconds: number) {
        if (this.adopting) return;
        this.time = seconds;
        if (this.url) this.player.seek(seconds);
    }

    get duration() {
        return this.length;
    }

    get paused() {
        return this.stopped;
    }

    get volume() {
        return this.level;
    }

    set volume(volume: number) {
        this.level = volume;
        this.player.setVolume(volume);
    }

    removeAttribute(name: string) {
        if (name === "src") this.url = "";
    }

    /** Load `src` (paused, at its start), or let the file go without one. */
    load() {
        this.time = 0;
        this.length = NaN;
        this.error = null;
        this.setPaused(true);
        this.starting?.reject(new DOMException("The play() request was interrupted by a new load request.", "AbortError"));
        this.starting = null;
        this.fire("emptied");
        if (!this.url) {
            this.player.unload();
            return;
        }
        this.fire("loadstart");
        const path = pathOf(this.url);
        const before = this.playingBefore;
        this.playingBefore = null;
        if (before?.path === path) {
            this.takeOver(before);
            return;
        }
        this.player.load(path, 0);
    }

    /** The track that still plays from before this page: as it is, where it is. */
    private takeOver(state: PlayingState) {
        this.time = state.position;
        this.adopting = true;
        // After the caller's own steps (it sets the position, waits for the metadata).
        setTimeout(() => {
            if (state.duration !== null) {
                this.length = state.duration;
                this.fire("durationchange");
                this.fire("loadedmetadata");
            }
            this.adopting = false;
            this.fire("timeupdate");
            if (state.playing) this.setPaused(false);
        });
    }

    play(): Promise<void> {
        if (!this.url) return Promise.reject(new DOMException("The element has no supported sources.", "NotSupportedError"));
        this.setPaused(false);
        this.player.play();
        return new Promise((resolve, reject) => {
            this.starting = { resolve, reject };
        });
    }

    pause() {
        this.setPaused(true);
        this.player.pause();
    }

    /** What the system's media controls show. */
    setNowPlaying(info: NowPlaying) {
        this.player.setMetadata(JSON.stringify(info));
    }

    private receive(event: PlayerEvent) {
        switch (event.type) {
            case "loaded":
                if (Number.isFinite(this.length) && this.length === event.duration) return;
                this.length = event.duration;
                this.fire("durationchange");
                this.fire("loadedmetadata");
                break;
            case "play":
                this.setPaused(false);
                break;
            case "pause":
                this.setPaused(true);
                break;
            case "time":
                this.time = event.position;
                this.fire("timeupdate");
                if (!this.stopped && this.starting) {
                    this.starting.resolve();
                    this.starting = null;
                    this.fire("playing");
                }
                break;
            case "seeked":
                this.time = event.position;
                this.fire("seeked");
                this.fire("timeupdate");
                break;
            case "ended":
                this.time = Number.isFinite(this.length) ? this.length : this.time;
                this.fire("timeupdate");
                this.setPaused(true);
                this.fire("ended");
                break;
            case "error":
                this.error = { code: 4, message: event.message };
                this.starting?.reject(new Error(event.message));
                this.starting = null;
                this.setPaused(true);
                this.fire("error");
                break;
            case "next":
                this.fire("nexttrack");
                break;
            case "previous":
                this.fire("previoustrack");
                break;
        }
    }

    // "play" / "pause" once per change, whoever made it (the page, the system's controls).
    private setPaused(paused: boolean) {
        if (paused === this.stopped) return;
        this.stopped = paused;
        this.fire(paused ? "pause" : "play");
    }

    private fire(type: string) {
        this.dispatchEvent(new Event(type));
    }
}

/** A new player for the app: the native one on Android, else an `<audio>`. */
export const createPlayer = (): HTMLAudioElement =>
    bridge ? new NativeAudio(bridge) as unknown as HTMLAudioElement : new Audio();

/** The native player, when `element` is one. */
export const asNativeAudio = (element: HTMLAudioElement): NativeAudio | null =>
    element instanceof NativeAudio ? element : null;
