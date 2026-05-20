"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraderTaskQueue = void 0;
class TraderTaskQueue {
    activeTraderTasks = new Map();
    size() {
        return this.activeTraderTasks.size;
    }
    enqueue(userAddress, taskFactory) {
        const existingTask = this.activeTraderTasks.get(userAddress);
        const nextTask = (existingTask || Promise.resolve())
            .then(taskFactory)
            .finally(() => {
            if (this.activeTraderTasks.get(userAddress) === nextTask) {
                this.activeTraderTasks.delete(userAddress);
            }
        });
        this.activeTraderTasks.set(userAddress, nextTask);
    }
}
exports.TraderTaskQueue = TraderTaskQueue;
