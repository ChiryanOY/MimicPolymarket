"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("./env");
const chalk_1 = __importDefault(require("chalk"));
const uri = env_1.ENV.MONGO_URI || 'mongodb://localhost:27017/polymarket_mimictrading';
const connectDB = async () => {
    try {
        await mongoose_1.default.connect(uri);
        console.log(chalk_1.default.green('✓'), 'MongoDB connected');
    }
    catch (error) {
        console.log(chalk_1.default.red('✗'), 'MongoDB connection failed:', error);
        process.exit(1);
    }
};
/**
 * Close MongoDB connection gracefully
 */
const closeDB = async () => {
    try {
        await mongoose_1.default.connection.close();
        console.log(chalk_1.default.green('✓'), 'MongoDB connection closed');
    }
    catch (error) {
        console.log(chalk_1.default.red('✗'), 'Error closing MongoDB connection:', error);
    }
};
exports.closeDB = closeDB;
exports.default = connectDB;
