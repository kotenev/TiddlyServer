import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';

import { format } from "util";
import { Observable, Subscriber } from '../lib/rx';
import { EventEmitter } from "events";
//import { StateObject } from "./index";
import { send } from '../lib/bundled-lib';
import { Stats } from 'fs';
let DEBUGLEVEL = -1;
export const typeLookup: { [k: string]: string } = {};
export function init(eventer: EventEmitter) {
    eventer.on('settings', function (set: ServerConfig) {
        DEBUGLEVEL = set.debugLevel;
        Object.keys(set.types).forEach(type => {
            set.types[type].forEach(ext => {
                if (!typeLookup[ext]) {
                    typeLookup[ext] = type;
                } else {
                    throw format('Multiple types for extension %s: %s', ext, typeLookup[ext], type);
                }
            })
        })
    })
}

export function getHumanSize(size: number) {
    const TAGS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let power = 0;
    while (size >= 1024) {
        size /= 1024;
        power++;
    }
    return size.toFixed(1) + TAGS[power];
}

export type Hashmap<T> = { [K: string]: T };

export type FolderEntryType = 'folder' | 'datafolder' | 'htmlfile' | 'other' | 'error';

export interface DirectoryEntry {
    name: string,
    type: string,
    path: string,
    size: string
}

export interface Directory {
    path: string,
    entries: DirectoryEntry[]
    type: string
}

export function tryParseJSON(str: string, errObj: { error?: JsonError } | true = {}) {
    function findJSONError(message: string, json: string) {
        const res: string[] = [];
        const match = /position (\d+)/gi.exec(message);
        if (!match) return "";
        const position = +match[1];
        const lines = json.split('\n');
        let current = 1;
        let i = 0;
        for (; i < lines.length; i++) {
            current += lines[i].length + 1; //add one for the new line
            res.push(lines[i]);
            if (current > position) break;
        }
        const linePos = lines[i].length - (current - position) - 1; //take the new line off again
        //not sure why I need the +4 but it seems to hold out.
        res.push(new Array(linePos + 4).join('-') + '^  ' + message);
        for (i++; i < lines.length; i++) {
            res.push(lines[i]);
        }
        return res.join('\n');
    }
    str = str.replace(/\t/gi, '    ').replace(/\r\n/gi, '\n');
    try {
        return JSON.parse(str);
    } catch (e) {
        let err = new JsonError(findJSONError(e.message, str), e)
        if (errObj === true) {

        } else
            errObj.error = err;
    }
}
export interface JsonErrorContainer {
    error?: JsonError
}
export class JsonError {
    public filePath: string = "";
    constructor(
        public errorPosition: string,
        public originalError: Error
    ) {

    }
}

export function keys<T>(o: T): (keyof T)[] {
    return Object.keys(o) as (keyof T)[];
}
export function padLeft(str: any, pad: number | string, padStr?: string): string {
    var item = str.toString();
    if (typeof padStr === 'undefined')
        padStr = ' ';
    if (typeof pad === 'number') {
        pad = new Array(pad + 1).join(padStr);
    }
    //pad: 000000 val: 6543210 => 654321
    return pad.substr(0, Math.max(pad.length - item.length, 0)) + item;
}
export function sortBySelector<T extends { [k: string]: string }>(key: (e: T) => any) {
    return function (a: T, b: T) {
        var va = key(a);
        var vb = key(b);

        if (va > vb)
            return 1;
        else if (va < vb)
            return -1;
        else
            return 0;
    }

}
export function sortByKey(key: string) {
    return sortBySelector(e => e[key]);
}
export namespace colors {
    export const Reset = "\x1b[0m"
    export const Bright = "\x1b[1m"
    export const Dim = "\x1b[2m"
    export const Underscore = "\x1b[4m"
    export const Blink = "\x1b[5m"
    export const Reverse = "\x1b[7m"
    export const Hidden = "\x1b[8m"

    export const FgBlack = "\x1b[30m"
    export const FgRed = "\x1b[31m"
    export const FgGreen = "\x1b[32m"
    export const FgYellow = "\x1b[33m"
    export const FgBlue = "\x1b[34m"
    export const FgMagenta = "\x1b[35m"
    export const FgCyan = "\x1b[36m"
    export const FgWhite = "\x1b[37m"

    export const BgBlack = "\x1b[40m"
    export const BgRed = "\x1b[41m"
    export const BgGreen = "\x1b[42m"
    export const BgYellow = "\x1b[43m"
    export const BgBlue = "\x1b[44m"
    export const BgMagenta = "\x1b[45m"
    export const BgCyan = "\x1b[46m"
    export const BgWhite = "\x1b[47m"
}


/**
 *  4 - Errors that require the process to exit for restart
 *  3 - Major errors that are handled and do not require a server restart
 *  2 - Warnings or errors that do not alter the program flow but need to be marked (minimum for status 500)
 *  1 - Info - Most startup messages
 *  0 - Normal debug messages and all software and request-side error messages
 * -1 - Detailed debug messages from high level apis
 * -2 - Response status messages and error response data
 * -3 - Request and response data for all messages (verbose)
 * -4 - Protocol details and full data dump (such as encryption steps and keys)
 */
declare function DebugLog(level: number, err: NodeJS.ErrnoException);
declare function DebugLog(level: number, str: string, ...args: any[]);
// declare function DebugLog(str: string, ...args: any[]);
export function isError(obj): obj is Error {
    return obj.constructor === Error;
    // return [obj.message, obj.name].every(e => typeof e !== "undefined");
}
export function isErrnoException(obj: NodeJS.ErrnoException): obj is NodeJS.ErrnoException {
    return isError(obj);
}
export function DebugLogger(prefix: string): typeof DebugLog {
    //if(prefix.startsWith("V:")) return function(){};
    return function (msgLevel: number, ...args: any[]) {
        if (DEBUGLEVEL > msgLevel) return;
        if (isError(args[0])) {
            let err = args[0];
            args = [];
            if (err.stack) args.push(err.stack);
            else args.push("Error %s: %s", err.name, err.message);
        }
        let t = new Date();
        let date = format('%s-%s-%s %s:%s:%s', t.getFullYear(), padLeft(t.getMonth() + 1, '00'), padLeft(t.getDate(), '00'),
            padLeft(t.getHours(), '00'), padLeft(t.getMinutes(), '00'), padLeft(t.getSeconds(), '00'));
        console.log([' ', (msgLevel >= 3 ? (colors.BgRed + colors.FgWhite) : colors.FgRed) + prefix,
            colors.FgCyan, date, colors.Reset, format.apply(null, args)].join(' ').split('\n').map((e, i) => {
                if (i > 0) {
                    return new Array(28 + prefix.length).join(' ') + e;
                } else {
                    return e;
                }
            }).join('\n'));

    } as typeof DebugLog;
}



export function sanitizeJSON(key: string, value: any) {
    // returning undefined omits the key from being serialized
    if (!key) { return value; } //This is the entire value to be serialized
    else if (key.substring(0, 1) === "$") return; //Remove angular tags
    else if (key.substring(0, 1) === "_") return; //Remove NoSQL tags
    else return value;
}

export interface ServeStaticResult {
    status: number,
    headers: {},
    message: string
}

// export const serveStatic: (path: string, state: StateObject, stat: fs.Stats) => Observable<[
//     boolean, ServeStaticResult
// ]> = (function () {
//     interface Server {
//         serveFile(pathname: string, status: number, headers: {}, req: http.IncomingMessage, res: http.ServerResponse): EventEmitter
//         respond(...args: any[]): any;
//         finish(...args: any[]): any;
//     }
//     const staticServer = require('../lib/node-static');
//     const serve = new staticServer.Server({
//         mount: '/'
//         // gzipTransfer: true, 
//         // gzip:/^(text\/html|application\/javascript|text\/css|application\/json)$/gi 
//     }) as Server;
//     const promise = new EventEmitter();
//     return function (path: string, state: StateObject, stat: fs.Stats) {
//         const { req, res } = state;
//         return Observable.create((subs: Subscriber<[boolean, ServeStaticResult]>) => {
//             serve.respond(null, 200, {
//                 'x-api-access-type': 'file'
//             }, [path], stat, req, res, function (status: number, headers: any) {
//                 serve.finish(status, headers, req, res, promise, (err: ServeStaticResult, res: ServeStaticResult) => {
//                     if (err) {
//                         subs.next([true, err]);
//                     } else {
//                         subs.next([false, res]);
//                     }
//                     subs.complete();
//                 });
//             });
//         })
//     }

// })();


export function serveFile(obs: Observable<StateObject>, file: string, root: string) {
    return obs.mergeMap(state => {
        return obs_stat(state)(path.join(root, file)).mergeMap(([err, stat]): any => {
            if (err) return state.throw<StateObject>(404);
            send(state.req, file, { root })
                .on('error', err => {
                    state.log(2, '%s %s', err.status, err.message).error().throw(500);
                }).pipe(state.res);
            return Observable.empty<StateObject>();
        }) as Observable<StateObject>;
    }).ignoreElements();
}
export function serveFolder(obs: Observable<StateObject>, mount: string, root: string, serveIndex?: Function) {
    return obs.do(state => {
        const pathname = state.url.pathname;
        if (state.url.pathname.slice(0, mount.length) !== mount) {
            state.log(2, 'URL is different than the mount point %s', mount).throw(500);
        } else {
            send(state.req, pathname.slice(mount.length), { root })
                .on('error', (err) => {
                    state.log(-1, '%s %s', err.status, err.message).error().throw(404);
                })
                .on('directory', (res, fp) => {
                    if (serveIndex) {
                        serveIndex(state, res, fp);
                    } else {
                        state.throw(403);
                    }
                })
                .pipe(state.res);
        }
    }).ignoreElements();
}
export function serveFolderIndex(options: { type: string }) {
    function readFolder(folder: string) {
        return obs_readdir()(folder).mergeMap(([err, files]) => {
            return Observable.from(files)
        }).mergeMap(file => {
            return obs_stat(file)(path.join(folder, file));
        }).map(([err, stat, key]) => {
            let itemtype = stat.isDirectory() ? 'directory' : (stat.isFile() ? 'file' : 'other');
            return { key, itemtype };
        }).reduce((n, e) => {
            n[e.itemtype].push(e.key);
            return n;
        }, { "directory": [], "file": [] });
    }
    if (options.type === "json") {
        return function (state: StateObject, res: http.ServerResponse, folder: string) {
            readFolder(folder).subscribe(item => {
                res.writeHead(200);
                res.write(JSON.stringify(item));
                res.end();
            })
        }
    }
}

/**
 * Returns the keys and paths from the PathResolverResult directory. If there
 * is an error it will be sent directly to the client and nothing will be emitted. 
 * 
 * @param {PathResolverResult} result 
 * @returns 
 */
export function getTreeItemFiles(result: PathResolverResult): Observable<DirectoryIndexData> {
    let dirpath = [
        result.treepathPortion.join('/'),
        result.filepathPortion.join('/')
    ].filter(e => e).join('/')
    let type = typeof result.item === "object" ? "category" : "folder";
    if (typeof result.item === "object") {
        const keys = Object.keys(result.item);
        const paths = keys.map(k => {
            return typeof result.item[k] === "string" ? result.item[k] : true;
        });
        return Observable.of({ keys, paths, dirpath, type });
    } else {
        return obs_readdir()(result.fullfilepath).map(([err, keys]) => {
            if (err) {
                result.state.log(2, 'Error calling readdir on folder "%s": %s', result.fullfilepath, err.message);
                result.state.throw(500);
                return;
            }
            const paths = keys.map(k => path.join(result.fullfilepath, k));
            return { keys, paths, dirpath, type };
        }).filter(obsTruthy);
    }
}

/// directory handler section =============================================
//I have this in a JS file so I can edit it without recompiling
const { generateDirectoryListing } = require('./generateDirectoryListing');
export type DirectoryIndexData = { keys: string[], paths: (string | boolean)[], dirpath: string, type: string };
export type DirectoryIndexOptions = { upload: boolean, mkdir: boolean }
export function sendDirectoryIndex([_r, options]: [DirectoryIndexData, DirectoryIndexOptions]) {
    let { keys, paths, dirpath, type } = _r;
    let pairs = keys.map((k, i) => [k, paths[i]]);
    return Observable.from(pairs).mergeMap(([key, val]: [string, string | boolean]) => {
        //if this is a category, just return the key
        if (typeof val === "boolean") return Observable.of({ key })
        //otherwise return the statPath result
        else return statPath(val).then(res => { return { stat: res, key }; });
    }).reduce((n, e: { key: string, stat?: StatPathResult }) => {
        let linkpath = [dirpath, e.key].filter(e => e).join('/');
        n.push({
            name: e.key,
            path: e.key + ((!e.stat || e.stat.itemtype === "folder") ? "/" : ""),
            type: (!e.stat ? "category" : (e.stat.itemtype === "file"
                ? typeLookup[e.key.split('.').pop() as string] || 'other'
                : e.stat.itemtype as string)),
            size: (e.stat && e.stat.stat) ? getHumanSize(e.stat.stat.size) : ""
        });
        return n;
    }, [] as DirectoryEntry[]).map(entries => {
        return generateDirectoryListing({ path: dirpath, entries, type }, options);
    });
}

/**
 * If the path 
 */
export function statWalkPath(test: PathResolverResult) {
    // let endStat = false;
    if (typeof test.item === "object")
        throw "property item must be a string";
    let endWalk = false;
    return Observable.from([test.item].concat(test.filepathPortion)).scan((n, e) => {
        return { statpath: path.join(n.statpath, e), index: n.index + 1, endStat: false };
    }, { statpath: "", index: -1, endStat: false }).concatMap(s => {
        if (endWalk) return Observable.empty<never>();
        else return Observable.fromPromise(
            statPath(s).then(res => { endWalk = endWalk || res.endStat; return res; })
        );
    }).takeLast(1);
}
/**
 * returns the info about the specified path. endstat is true if the statpath is not
 * found or if it is a directory and contains a tiddlywiki.info file, or if it is a file.
 * 
 * @param {({ statpath: string, index: number, endStat: boolean } | string)} s 
 * @returns 
 */
export function statPath(s: { statpath: string, index: number, endStat: boolean } | string) {
    if (typeof s === "string") s = { statpath: s, index: 0, endStat: false };
    const { statpath, index } = s;
    let { endStat } = s;
    if (typeof endStat !== "boolean") endStat = false;
    return new Promise<StatPathResult>(resolve => {
        // What I wish I could write (so I did)
        obs_stat(fs.stat)(statpath).chainMap(([err, stat]) => {
            if (err || stat.isFile()) endStat = true;
            if (!err && stat.isDirectory())
                return obs_stat(stat)(path.join(statpath, "tiddlywiki.info"));
            else resolve({ stat, statpath, index, endStat, itemtype: '' })
        }).concatAll().subscribe(([err2, infostat, stat]) => {
            if (!err2 && infostat.isFile()) {
                endStat = true;
                resolve({ stat, statpath, infostat, index, endStat, itemtype: '' })
            } else
                resolve({ stat, statpath, index, endStat, itemtype: '' });
        });
    }).then(res => {
        res.itemtype = getItemType(res.stat, res.infostat)
        return res;
    })
}

function getItemType(stat: Stats, infostat: Stats | undefined) {
    let itemtype;

    if (!stat) itemtype = "error";
    else if (stat.isDirectory()) itemtype = !!infostat ? "datafolder" : "folder";
    else if (stat.isFile() || stat.isSymbolicLink()) itemtype = "file"
    else itemtype = "error"

    return itemtype;

}

export function resolvePath(state: StateObject, tree: TreeObject): PathResolverResult | undefined {
    var reqpath = decodeURI(state.path.slice().filter(a => a).join('/')).split('/').filter(a => a);

    //if we're at root, just return it
    if (reqpath.length === 0) return {
        item: tree,
        reqpath,
        treepathPortion: [],
        filepathPortion: [],
        fullfilepath: typeof tree === "string" ? tree : '',
        state
    };
    //check for invalid items (such as ..)
    if (!reqpath.every(a => a !== ".." && a !== ".")) return;

    var result = (function () {
        var item: any = tree;
        var folderPathFound = false;
        for (var end = 0; end < reqpath.length; end++) {
            if (typeof item !== 'string' && typeof item[reqpath[end]] !== 'undefined') {
                item = item[reqpath[end]];
            } else if (typeof item === "string") {
                folderPathFound = true; break;
            } else break;
        }
        return { item, end, folderPathFound } as TreePathResult;
    })();

    if (reqpath.length > result.end && !result.folderPathFound) return;

    //get the remainder of the path
    let filepathPortion = reqpath.slice(result.end).map(a => a.trim());

    const fullfilepath = (result.folderPathFound)
        ? path.join(result.item, ...filepathPortion)
        : (typeof result.item === "string" ? result.item : '');

    return {
        item: result.item,
        reqpath,
        treepathPortion: reqpath.slice(0, result.end),
        filepathPortion,
        fullfilepath,
        state
    };
}

type NodeCallback<T, S> = [NodeJS.ErrnoException, T, S];


// export function obs<S>(state?: S) {
//     return Observable.bindCallback(fs.stat, (err, stat): NodeCallback<fs.Stats, S> => [err, stat, state] as any);
// }

export const obs_stat = <T>(state?: T) => Observable.bindCallback(
    fs.stat, (err, stat): NodeCallback<fs.Stats, T> => [err, stat, state] as any);

export const obs_readdir = <T>(state?: T) => Observable.bindCallback(
    fs.readdir, (err, files): NodeCallback<string[], T> => [err, files, state] as any);

export const obs_readFile = <T>(tag: T = undefined as any): typeof obs_readFile_inner =>
    (filepath: string, encoding?: string) =>
        new Observable(subs => {
            if (encoding) fs.readFile(filepath, encoding, (err, data) => {
                subs.next([err, data, tag, filepath]);
                subs.complete();
            });
            else fs.readFile(filepath, (err, data) => {
                subs.next([err, data, tag, filepath]);
                subs.complete();
            })
        }) as any;

declare function obs_readFile_inner<T>(filepath: string): Observable<[NodeJS.ErrnoException, Buffer, T, string]>;
declare function obs_readFile_inner<T>(filepath: string, encoding: string): Observable<[NodeJS.ErrnoException, string, T, string]>;

// Observable.bindCallback(fs.readFile,
//     (err, data): NodeCallback<string | Buffer, T> => [err, data, state] as any
// );

export const obs_writeFile = <T>(state?: T) => Observable.bindCallback(
    fs.writeFile, (err, data): NodeCallback<string | Buffer, T> => [err, data, state] as any);


export class StateError extends Error {
    state: StateObject;
    constructor(state: StateObject, message: string) {
        super(message);
        this.state = state;
    }
}
export type StatPathResult = {
    stat: fs.Stats,
    statpath: string,
    infostat?: fs.Stats,
    index: number,
    /**
     * error, folder, datafolder, file
     * 
     * @type {string}
     */
    itemtype: string,
    /**
     * either the path does not exist or it is a data folder
     * 
     * @type {boolean}
     */
    endStat: boolean
}

// export type LoggerFunc = (str: string, ...args: any[]) => void;

export class StateObject {

    static errorRoute(status: number, reason?: string) {
        return (obs: Observable<any>): any => {
            return obs.mergeMap((state: StateObject) => {
                return state.throw(status, reason);
            })
        }
    }

    // req: http.IncomingMessage;
    // res: http.ServerResponse;
    startTime: [number, number];
    timestamp: string;

    body: string;
    json: any | undefined;

    statPath: StatPathResult;

    url: {
        href: string;
        protocol: string;
        auth?: string;
        host: string;
        hostname: string;
        port?: string;
        pathname: string;
        path: string;
        search?: string;
        query?: string | any;
        slashes?: boolean;
        hash?: string;
    };
    path: string[];

    maxid: number;

    where: string;
    query: any;
    errorThrown: Error;

    restrict: any;

    expressNext: ((err?: any) => void) | false;

    constructor(
        public req: http.IncomingMessage,
        public res: http.ServerResponse,
        private debugLog: typeof DebugLog,
        private eventer: EventEmitter,
        public readonly isLocalHost: boolean = false
    ) {
        this.startTime = process.hrtime();
        //parse the url and store in state.
        //a server request will definitely have the required fields in the object
        this.url = url.parse(this.req.url as string, true) as any
        //parse the path for future use
        this.path = (this.url.pathname as string).split('/')

        let t = new Date();
        this.timestamp = format('%s-%s-%s %s:%s:%s', t.getFullYear(), padLeft(t.getMonth() + 1, '00'), padLeft(t.getDate(), '00'),
            padLeft(t.getHours(), '00'), padLeft(t.getMinutes(), '00'), padLeft(t.getSeconds(), '00'));
        this.res.on('finish', () => {
            if (this.hasCriticalLogs) this.error();
            if (this.errorThrown) this.eventer.emit('stateError', this);
        })

    }
    // debug(str: string, ...args: any[]) {
    //     this.debugLog('[' +
    //         this.req.socket.remoteFamily + '-' + colors.FgMagenta +
    //         this.req.socket.remoteAddress + colors.Reset + '] ' +
    //         format.apply(null, arguments)
    //     );
    // }

    loglevel: number = DEBUGLEVEL;
    doneMessage: string[] = [];
    hasCriticalLogs: boolean = false;
    /**
     *  4 - Errors that require the process to exit for restart
     *  3 - Major errors that are handled and do not require a server restart
     *  2 - Warnings or errors that do not alter the program flow but need to be marked (minimum for status 500)
     *  1 - Info - Most startup messages
     *  0 - Normal debug messages and all software and request-side error messages
     * -1 - Detailed debug messages from high level apis
     * -2 - Response status messages and error response data
     * -3 - Request and response data for all messages (verbose)
     * -4 - Protocol details and full data dump (such as encryption steps and keys)
     */
    log(level: number, ...args: any[]) {
        if (level < this.loglevel) return this;
        if (level > 1) this.hasCriticalLogs = true;
        this.doneMessage.push(format.apply(null, args));
        return this;
    }
    error() {
        this.errorThrown = new Error(this.doneMessage.join('\n'));
        return this;
    }
    throw<T = StateObject>(statusCode: number, reason?: string, headers?: Hashmap<string>): Observable<T> {
        if (!this.res.headersSent) {
            this.res.writeHead(statusCode, reason && reason.toString(), headers);
            //don't write 204 reason
            if (statusCode !== 204 && reason) this.res.write(reason.toString());
        }
        this.res.end();
        return Observable.empty<never>();
    }
    endJSON(data: any) {
        this.res.write(JSON.stringify(data));
        this.res.end();
    }
    redirect(redirect: string) {
        this.res.writeHead(302, {
            'Location': redirect
        });
        this.res.end();
    }
    recieveBody() {
        return recieveBody(this);
    }

}
/** to be used with concatMap, mergeMap, etc. */
export function recieveBody(state: StateObject) {
    //get the data from the request
    return Observable.fromEvent<Buffer>(state.req, 'data')
        //only take one since we only need one. this will dispose the listener
        .takeUntil(Observable.fromEvent(state.req, 'end').take(1))
        //accumulate all the chunks until it completes
        .reduce<Buffer>((n, e) => { n.push(e); return n; }, [])
        //convert to json and return state for next part
        .map(e => {
            state.body = Buffer.concat(e).toString('utf8');
            //console.log(state.body);
            if (state.body.length === 0)
                return state;
            try {
                state.json = JSON.parse(state.body);
            } catch (e) {
                //state.json = buf;
            }
            return state;
        });
}
export interface ThrowFunc<T> {
    throw(statusCode: number, reason?: string, str?: string, ...args: any[]): Observable<T>;
}

export interface ServerConfig {
    _disableLocalHost: boolean;
    tree: any,
    types: {
        htmlfile: string[];
        [K: string]: string[]
    }
    username?: string,
    password?: string,
    host: string,
    port: number | 8080,
    backupDirectory?: string,
    etag: "required" | "disabled" | "", //otherwise if present
    etagWindow: number,
    useTW5path: boolean,
    debugLevel: number,
    /** cache max age in milliseconds for different types of data */
    maxAge: { tw_plugins: number }
    tsa: {
        alwaysRefreshCache: boolean;
    },
    allowNetwork: {
        upload: boolean
        mkdir: boolean
        settings: boolean
        WARNING_all_settings_WARNING: boolean
    }
}

export interface AccessPathResult<T> {
    isFullpath: boolean,
    type: string | NodeJS.ErrnoException,
    tag: T,
    end: number,
    statItem: fs.Stats,
    statTW?: fs.Stats
};
export interface AccessPathTag {
    state: StateObject,
    item: string | {},
    treepath: string,
    filepath: string
};
export interface PathResolverResult {
    //the tree string returned from the path resolver
    item: string | TreeObject;
    // client request url path
    reqpath: string[];
    // tree part of request url
    treepathPortion: string[];
    // file part of request url
    filepathPortion: string[];
    // item + filepath if item is a string
    fullfilepath: string;
    state: StateObject;
}
export type TreeObject = { [K: string]: string | TreeObject };
export type TreePathResultObject<T, U, V> = { item: T, end: U, folderPathFound: V }
export type TreePathResult =
    TreePathResultObject<TreeObject, number, false>
    | TreePathResultObject<string, number, false>
    | TreePathResultObject<string, number, true>;
export function createHashmapString<T>(keys: string[], values: T[]): { [id: string]: T } {
    if (keys.length !== values.length)
        throw 'keys and values must be the same length';
    var obj: { [id: string]: T } = {};
    keys.forEach((e, i) => {
        obj[e] = values[i];
    })
    return obj;
}
export function createHashmapNumber<T>(keys: number[], values: T[]): { [id: number]: T } {
    if (keys.length !== values.length)
        throw 'keys and values must be the same length';
    var obj: { [id: number]: T } = {};
    keys.forEach((e, i) => {
        obj[e] = values[i];
    })
    return obj;
}

export function obsTruthy<T>(a: T | undefined | null | false | "" | 0 | void): a is T {
    return !!a;
}

const ERRORS = {
    'PROGRAMMER_EXCEPTION': 'A programmer exception occurred: %s'
}

export function getError(code: 'PRIMARY_KEYS_REQUIRED'): any;
export function getError(code: 'OLD_REVISION'): any;
export function getError(code: 'KEYS_REQUIRED', keyList: string): any;
export function getError(code: 'ROW_NOT_FOUND', table: string, id: string): any;
export function getError(code: 'PROGRAMMER_EXCEPTION', message: string): any;
export function getError(code: string, ...args: string[]): any;
export function getError(...args: string[]) {
    let code = args.shift() as keyof typeof ERRORS;
    if (ERRORS[code]) args.unshift(ERRORS[code])
    //else args.unshift(code);
    return { code: code, message: format.apply(null, args) };
}


