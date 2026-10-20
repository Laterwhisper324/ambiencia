"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const handler = async (req, res) => {
    try {
        const mod = await Promise.resolve().then(() => __importStar(require('./app')));
        const app = mod.app || mod.default;
        return app(req, res);
    }
    catch (err) {
        console.error('[Bootstrap Error]:', err);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            bootstrapError: true,
            message: err?.message || String(err),
            stack: err?.stack,
            cwd: typeof process !== 'undefined' ? process.cwd() : null,
        }));
    }
};
if (typeof process !== 'undefined' && !process.env.VERCEL) {
    Promise.resolve().then(() => __importStar(require('./app'))).then((mod) => {
        mod.startStandaloneServer();
    })
        .catch((err) => {
        console.error('[Standalone Startup Error]:', err);
    });
}
exports.app = handler;
exports.default = handler;
