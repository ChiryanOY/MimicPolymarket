import { ENV } from '../config/env';
import { getUserActivityModel, getUserPositionModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import Logger from '../utils/logger';

const USER_ADDRESSES = ENV.USER_ADDRESSES;
const FETCH_INTERVAL = ENV.FETCH_INTERVAL;
const STARTUP_TIMESTAMP = Math.floor(Date.now() / 1000);

if (!USER_ADDRESSES || USER_ADDRESSES.length === 0) {
    throw new Error('USER_ADDRESSES is not defined or empty');
}

// Create activity and position models for each user
const userModels = USER_ADDRESSES.map((address) => ({
    address,
    UserActivity: getUserActivityModel(address),
    UserPosition: getUserPositionModel(address),
}));

const init = async () => {
    const counts: number[] = [];
    for (const { UserActivity } of userModels) {
        const count = await UserActivity.countDocuments();
        counts.push(count);
    }
    Logger.clearLine();
    Logger.dbConnection(USER_ADDRESSES, counts);

    // Show your own positions first
    try {
        const myPositionsUrl = `https://data-api.polymarket.com/positions?user=${ENV.TRADING_WALLET}`;
        const myPositions = await fetchData(myPositionsUrl);

        // Get current USDC balance
        const getMyBalance = (await import('../utils/getMyBalance')).default;
        const currentBalance = await getMyBalance(ENV.TRADING_WALLET);

        if (Array.isArray(myPositions) && myPositions.length > 0) {
            // Calculate your overall profitability and initial investment
            let totalValue = 0;
            let initialValue = 0;
            let weightedPnl = 0;
            myPositions.forEach((pos: any) => {
                const value = pos.currentValue || 0;
                const initial = pos.initialValue || 0;
                const pnl = pos.percentPnl || 0;
                totalValue += value;
                initialValue += initial;
                weightedPnl += value * pnl;
            });
            const myOverallPnl = totalValue > 0 ? weightedPnl / totalValue : 0;

            // Get top 5 positions by profitability (PnL)
            const myTopPositions = myPositions
                .sort((a: any, b: any) => (b.percentPnl || 0) - (a.percentPnl || 0))
                .slice(0, 5);

            Logger.clearLine();
            Logger.myPositions(
                ENV.TRADING_WALLET,
                myPositions.length,
                myTopPositions,
                myOverallPnl,
                totalValue,
                initialValue,
                currentBalance
            );
        } else {
            Logger.clearLine();
            Logger.myPositions(ENV.TRADING_WALLET, 0, [], 0, 0, 0, currentBalance);
        }
    } catch (error) {
        Logger.error(`Failed to fetch your positions: ${error}`);
    }

    // Show current positions count with details for traders you're mimicking
    const positionCounts: number[] = [];
    const positionDetails: any[][] = [];
    const profitabilities: number[] = [];
    for (const { UserPosition } of userModels) {
        const positions = await UserPosition.find().exec();
        positionCounts.push(positions.length);

        // Calculate overall profitability (weighted average by current value)
        let totalValue = 0;
        let weightedPnl = 0;
        positions.forEach((pos) => {
            const value = pos.currentValue || 0;
            const pnl = pos.percentPnl || 0;
            totalValue += value;
            weightedPnl += value * pnl;
        });
        const overallPnl = totalValue > 0 ? weightedPnl / totalValue : 0;
        profitabilities.push(overallPnl);

        // Get top 3 positions by profitability (PnL)
        const topPositions = positions
            .sort((a, b) => (b.percentPnl || 0) - (a.percentPnl || 0))
            .slice(0, 3)
            .map((p) => p.toObject());
        positionDetails.push(topPositions);
    }
    Logger.clearLine();
    Logger.tradersPositions(USER_ADDRESSES, positionCounts, positionDetails, profitabilities);
};

const fetchTradeData = async () => {
    // Parallel fetch all trader data for better performance
    const fetchPromises = userModels.map(async ({ address, UserActivity, UserPosition }) => {
        try {
            // Fetch TRADE activities and positions in PARALLEL
            // Note: MERGE activities are skipped (MERGE = trader combines YES/NO tokens into USDC)
            const tradeApiUrl = `https://data-api.polymarket.com/activity?user=${address}&type=TRADE`;
            const positionsUrl = `https://data-api.polymarket.com/positions?user=${address}`;

            const [tradeActivities, positions] = await Promise.all([
                fetchData(tradeApiUrl).catch(() => []),
                fetchData(positionsUrl).catch(() => []),
            ]);

            // Only process TRADE activities (MERGE is ignored)
            const allActivities = Array.isArray(tradeActivities) ? tradeActivities : [];

            // Process each activity
            for (const activity of allActivities) {
                const activityTimestamp = activity.timestamp || 0;
                if (activityTimestamp < STARTUP_TIMESTAMP) {
                    continue;
                }

                // Check if this trade already exists in database
                const existingActivity = await UserActivity.findOne({
                    transactionHash: activity.transactionHash,
                }).exec();

                if (existingActivity) {
                    continue; // Already processed this trade
                }

                // Save new trade to database
                const newActivity = new UserActivity({
                    proxyWallet: activity.proxyWallet,
                    timestamp: activity.timestamp,
                    conditionId: activity.conditionId,
                    type: activity.type,
                    size: activity.size,
                    usdcSize: activity.usdcSize,
                    transactionHash: activity.transactionHash,
                    price: activity.price,
                    asset: activity.asset,
                    side: activity.side,
                    outcomeIndex: activity.outcomeIndex,
                    title: activity.title,
                    slug: activity.slug,
                    icon: activity.icon,
                    eventSlug: activity.eventSlug,
                    outcome: activity.outcome,
                    name: activity.name,
                    pseudonym: activity.pseudonym,
                    bio: activity.bio,
                    profileImage: activity.profileImage,
                    profileImageOptimized: activity.profileImageOptimized,
                    bot: false,
                    botExcutedTime: 0,
                });

                await newActivity.save();
            }

                // Optimization: Don't await positions update here, let it happen in background
                // This removes DB latency from the critical path of triggering a trade
                if (Array.isArray(positions) && positions.length > 0) {
                    Promise.all(
                        positions.map((position: any) =>
                            UserPosition.findOneAndUpdate(
                                { asset: position.asset, conditionId: position.conditionId },
                                {
                                    proxyWallet: position.proxyWallet,
                                    asset: position.asset,
                                    conditionId: position.conditionId,
                                    size: position.size,
                                    avgPrice: position.avgPrice,
                                    initialValue: position.initialValue,
                                    currentValue: position.currentValue,
                                    cashPnl: position.cashPnl,
                                    percentPnl: position.percentPnl,
                                    totalBought: position.totalBought,
                                    realizedPnl: position.realizedPnl,
                                    percentRealizedPnl: position.percentRealizedPnl,
                                    curPrice: position.curPrice,
                                    redeemable: position.redeemable,
                                    mergeable: position.mergeable,
                                    title: position.title,
                                    slug: position.slug,
                                    icon: position.icon,
                                    eventSlug: position.eventSlug,
                                    outcome: position.outcome,
                                    outcomeIndex: position.outcomeIndex,
                                    oppositeOutcome: position.oppositeOutcome,
                                    oppositeAsset: position.oppositeAsset,
                                    endDate: position.endDate,
                                    negativeRisk: position.negativeRisk,
                                },
                                { upsert: true }
                            )
                        )
                    ).catch(err => Logger.error(`Background position update failed: ${err}`));
                }
        } catch (error) {
            Logger.error(
                `Error fetching data for ${address.slice(0, 6)}...${address.slice(-4)}: ${error}`
            );
        }
    });

    // Wait for all traders to be processed in parallel
    await Promise.all(fetchPromises);
};

// Track if this is the first run
let isFirstRun = true;
// Track if monitor should continue running
let isRunning = true;

/**
 * Stop the trade monitor gracefully
 */
export const stopTradeMonitor = () => {
    isRunning = false;
    Logger.info('Trade monitor shutdown requested...');
};

const tradeMonitor = async () => {
    await init();
    Logger.success(`Monitoring ${USER_ADDRESSES.length} trader(s) every ${FETCH_INTERVAL}s`);
    Logger.separator();

    // On first run, mark all existing historical trades as already processed
    if (isFirstRun) {
        Logger.info('First run: recovering stuck trades and marking historical trades as processed...');
        
        // Before marking everything, recover trades that were stuck in aggregation (bot: false, botExcutedTime: 1)
        for (const { address, UserActivity } of userModels) {
            const recoveredCount = await UserActivity.updateMany(
                { bot: false, botExcutedTime: 1 },
                { $set: { botExcutedTime: 0 } }
            );
            if (recoveredCount.modifiedCount > 0) {
                Logger.warning(
                    `Recovered ${recoveredCount.modifiedCount} stuck aggregated trade(s) for ${address.slice(0, 6)}...${address.slice(-4)}`
                );
            }
            
            // Now mark remaining old trades that have never been processed (bot: false, botExcutedTime: 0) as historical
            const count = await UserActivity.updateMany(
                { bot: false, botExcutedTime: 0 },
                { $set: { bot: true, botExcutedTime: 999 } }
            );
            if (count.modifiedCount > 0) {
                Logger.info(
                    `Marked ${count.modifiedCount} historical trades as processed for ${address.slice(0, 6)}...${address.slice(-4)}`
                );
            }
        }
        isFirstRun = false;
        Logger.success('\nHistorical trades processed. Now monitoring for new trades only.');
        Logger.separator();
    }

    while (isRunning) {
        await fetchTradeData();
        if (!isRunning) break;
        await new Promise((resolve) => setTimeout(resolve, FETCH_INTERVAL * 1000));
    }

    Logger.info('Trade monitor stopped');
};

export default tradeMonitor;
