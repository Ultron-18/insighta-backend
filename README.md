# Insighta Backend

The backend API for Insighta Labs+ — a secure, multi-interface profile intelligence platform.

## Live URL
https://web-production-5347.up.railway.app

## System Architecture
![alt text](image.png)

## Features
- Secure authentication using GitHub OAuth
- Multi-interface access: Web, CLI, API
- Token-based authentication with JWT
- Refresh token rotation
- Role-based access control (analyst, researcher, admin)

## Tech Stack
- Node.js
- Express.js
- PostgreSQL
- Prisma ORM
- JWT for authentication

## API Endpoints

### Authentication
- `POST /auth/github` - GitHub login
- `GET /auth/github/callback` - GitHub callback
- `POST /auth/refresh` - Refresh tokens
- `POST /auth/logout` - Logout
- `POST /auth/cli/callback` - CLI callback
- `GET /auth/me` - Get current user

### Users
- `GET /users` - List all users
- `GET /users/:id` - Get user by ID
- `GET /users/me` - Get current user
- `POST /users` - Create user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

### Scans
- `GET /scans` - List all scans
- `GET /scans/:id` - Get scan by ID
- `GET /scans/user/:userId` - Get scans by user
- `POST /scans` - Create scan
- `PUT /scans/:id` - Update scan
- `DELETE /scans/:id` - Delete scan

## Development

### Environment Variables

Create a `.env` file with the following variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/insighta
JWT_SECRET=your-jwt-secret
ACCESS_TOKEN_EXPIRY=30m
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback
GITHUB_CLI_CLIENT_ID=your-github-cli-client-id
GITHUB_CLI_CLIENT_SECRET=your-github-cli-client-secret
WEB_URL=http://localhost:3000
```

### Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Start server
npm run dev
```

## Testing

```bash
# Run tests
npm test
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Security

All secrets and environment variables should be stored securely and not committed to version control. Use environment variables to configure the application.

## Support

For issues, questions, or feature requests, please open an issue or submit a pull request.

## License
