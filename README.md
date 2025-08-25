# AI Chat Backend for SEI

This project is a TypeScript-based backend server for SEI AI Chat, providing a modular, session-based chat interface with tool-calling capabilities. It supports multiple LLM providers, uses dependency injection via InversifyJS, and connects to Model Context Protocol (MCP) servers for tools integration.

## Features

- 🧠 **Multiple LLM Support**: Integrates with Google Gemini, OpenAI, and LlamaAPI
- 🔧 **Tool Calling**: Connects to MCP servers for executing tools and functions
- 💾 **Session Management**: Maintains conversation history and state
- 📝 **Chat History**: Persists chat history in MongoDB
- 📊 **Transaction Management**: Records and retrieves user transactions
- 🔄 **LangGraph Integration**: Uses LangGraph for complex agent workflows

## Getting Started

### Prerequisites

- Node.js (v16+)
- Yarn package manager
- MongoDB instance
- Access to LLM APIs (Gemini, OpenAI, or LlamaAPI)
- MCP server for tools (typically running on port 3001)

### Environment Setup

Create a `.env` file in the root directory with the following variables:

--- Note: OPENAI_API_KEY and LLAMA_API_KEY varialbes (key) need to be added in the .env file (although they are not being used so no need to add keys for them )

```
# Server Configuration
PORT=3000

# Database Configuration
MONGO_URI=mongodb://localhost:27017/sei_ai_chat

# API Keys
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
LLAMA_API_KEY=your_llama_api_key_here

# MCP Server Configuration (for tools)
MCP_SERVER_URL=http://localhost:3001/sse
```

### Installation

1. Clone the repository:
```bash
git clone https://github.com/mr-shreyansh/sie_ai_chat_backend.git
cd sie_ai_chat_backend
```

2. Install dependencies:
```bash
yarn install
```

3. Build the project:
```bash
yarn build
```

### Running the Server

#### Development Mode

Run the server in development mode with hot-reloading:

```bash
yarn dev
```

#### Production Mode

Build and start the server in production mode:

```bash
yarn build
yarn start
```

## API Endpoints

### Chat

- `POST /api/llm/init`: Initialize a chat session
  - Body: `{ "address": "user-address" }`
  - Returns: Session information

- `POST /api/llm/chat`: Send a message to the LLM
  - Body: `{ "prompt": "your message", "address": "user-address" }`
  - Returns: LLM response and tool outputs

### Transactions

- `POST /api/llm/addtxn`: Add a transaction
  - Body: `{ "prompt": "transaction details", "address": "user-address" }`
  - Returns: Confirmation of transaction storage

### User Management

- `GET /api/user/:id`: Get user information
  - Returns: User profile and history

## Project Structure

```
src/
├── app.ts                  # Main application entry point
├── envConfig.ts            # Environment configuration
├── config/                 # Application constants
├── controller/             # API controllers
├── database/               # Database models and operations
│   └── mongo/
│       ├── models/         # Mongoose schemas
│       └── UserOp.ts       # User operations
├── ioc-container/          # Dependency injection setup
├── middleware/             # Express middleware
├── services/               # Business logic services
│   ├── interfaces/         # Service interfaces
│   ├── AuthService.ts      # Authentication service
│   ├── LlmService.ts       # LLM integration service
│   ├── MCPService.ts       # Tool integration service
│   └── UserService.ts      # User management service
├── types/                  # TypeScript type definitions
└── utils/                  # Utility functions
```

## Development

### Adding New Tools

1. Add the tool schema to your MCP server
2. The backend will automatically discover and integrate tools via the MCPService

### Adding New LLM Providers

1. Add the required API key to the `.env` file
2. Update LlmService.ts to support the new provider
3. Update the interface in ILlmService.ts

## Troubleshooting

- **Connection Issues**: Ensure your MCP server is running and accessible
- **MongoDB Errors**: Check your MongoDB connection string and ensure the service is running
- **API Key Errors**: Verify that all required API keys are correctly set in the `.env` file


