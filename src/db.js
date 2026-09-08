"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDb = connectDb;
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("./env");
let connecting = null;
function connectDb() {
    if (mongoose_1.default.connection.readyState === 1)
        return Promise.resolve(mongoose_1.default);
    if (!connecting) {
        mongoose_1.default.set("strictQuery", true);
        connecting = mongoose_1.default.connect(env_1.env.MONGODB_URI);
    }
    return connecting;
}
