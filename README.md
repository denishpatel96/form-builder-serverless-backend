# Formbuilder Project

## Tech Stacks

- Serverless Framework
- AWS Lambdas (Nodejs)
- AWS Dynamodb as database (Single Table Design)
- AWS Cognito for user authentication and authorization

## Project Build and Deploy

Project includes custom build commands so use them instead of using serverless commands directly to build and deploy.

### Build

Build step will create js file from ts file and create folder structures which are ready to be packaged and deployed as lambda functions. Run this to build the project:

```
  npm run build
```

### Deploy

Deploy step includes everything there is in build plus packaging and deploying it to the AWS. Run this to deploy the project:

```
  npm run deploy
```
