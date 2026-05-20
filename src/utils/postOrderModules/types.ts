export interface LimitOrderResult {
    filledSize: number;
    status: string;
    orderID?: string;
    orderType?: 'FOK' | 'GTC';
    success: boolean;
}
