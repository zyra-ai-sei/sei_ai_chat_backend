export const TYPES = {
    // controllers
    AuthController: Symbol.for('AuthController'),
    LlmController: Symbol.for('LlmController'),
    UserController: Symbol.for('UserController'),
    TransactionController: Symbol.for('TransactionController'),
    CryptoMarketController: Symbol.for('CryptoMarketController'),
    PortfolioController: Symbol.for('PortfolioController'),
    Hello: Symbol.for('Hello'),
    StrategyController: Symbol.for("StrategyController"),
    OrderController: Symbol.for("OrderController"),
    PrivyTransactionController: Symbol.for('PrivyTransactionController'),
    PrivyTestController: Symbol.for('PrivyTestController'),

    // services
    AuthService: Symbol.for('AuthService'),
    LlmService: Symbol.for('LlmService'),
    RedisService: Symbol.for('RedisService'),
    MCPService: Symbol.for('MCPService'),
    UserService: Symbol.for('UserService'),
    TransactionService: Symbol.for('TransactionService'),
    CryptoMarketService: Symbol.for('CryptoMarketService'),
    PortfolioService: Symbol.for('PortfolioService'),
    TwapEventService: Symbol.for('TwapEventService'),
    CronService: Symbol.for('CronService'),
    OrderService: Symbol.for('OrderService'),
    PrivyTransactionService: Symbol.for('PrivyTransactionService'),

    // database
    UserOp: Symbol.for('UserOp'),
    OrderOp: Symbol.for('OrderOp'),
    DelegatedTransactionOp: Symbol.for('DelegatedTransactionOp'),

    // middleware
    AuthMiddleware: Symbol.for('AuthMiddleware'),
    NetworkMiddleware: Symbol.for('NetworkMiddleware'),


    // constants
    Web3Provider: Symbol.for('Web3Provider'),
    WebSocketProvider: Symbol.for('WebSocketProvider')
};
