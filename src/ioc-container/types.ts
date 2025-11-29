export const TYPES = {
    // controllers
    AuthController: Symbol.for('AuthController'),
    LlmController: Symbol.for('LlmController'),
    UserController: Symbol.for('UserController'),
    TransactionController: Symbol.for('TransactionController'),
    CryptoMarketController: Symbol.for('CryptoMarketController'),
    Hello: Symbol.for('Hello'),

    // services
    AuthService: Symbol.for('AuthService'),
    LlmService: Symbol.for('LlmService'),
    RedisService: Symbol.for('RedisService'),
    MCPService: Symbol.for('MCPService'),
    UserService: Symbol.for('UserService'),
    TransactionService: Symbol.for('TransactionService'),
    CryptoMarketService: Symbol.for('CryptoMarketService'),

    // database
    UserOp: Symbol.for('UserOp'),

    // middleware
    AuthMiddleware: Symbol.for('AuthMiddleware')
};
