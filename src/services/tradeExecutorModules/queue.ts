export class TraderTaskQueue {
    private readonly activeTraderTasks = new Map<string, Promise<void>>();

    size(): number {
        return this.activeTraderTasks.size;
    }

    enqueue(userAddress: string, taskFactory: () => Promise<void>): void {
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
