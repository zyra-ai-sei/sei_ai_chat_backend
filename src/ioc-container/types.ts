export const TYPES = {
    // controllers
    AuthController: Symbol.for('AuthController'),
    LlmController: Symbol.for('LlmController'),
    UserController: Symbol.for('UserController'),
    TransactionController: Symbol.for('TransactionController'),
    PortfolioController: Symbol.for('PortfolioController'),
    Hello: Symbol.for('Hello'),

    // services
    AuthService: Symbol.for('AuthService'),
    LlmService: Symbol.for('LlmService'),
    RedisService: Symbol.for('RedisService'),
    MCPService: Symbol.for('MCPService'),
    UserService: Symbol.for('UserService'),
    TransactionService: Symbol.for('TransactionService'),
    PortfolioService: Symbol.for('PortfolioService'),

    // database
    UserOp: Symbol.for('UserOp'),

    // middleware
    AuthMiddleware: Symbol.for('AuthMiddleware')
};
