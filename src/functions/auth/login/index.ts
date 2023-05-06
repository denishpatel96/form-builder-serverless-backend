import {
  InitiateAuthCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommandInput,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
  const client = new CognitoIdentityProviderClient({ region: process.env.REGION });
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { email, password } = body;
    if (!(email && password)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "[Bad Request] Missing email or password",
        }),
      };
    }

    const loginParams: InitiateAuthCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    };
    const response = await client.send(new InitiateAuthCommand(loginParams));

    const idToken = response.AuthenticationResult?.IdToken;

    if (idToken === undefined) {
      return {
        statusCode: 401,
        body: "Authentication failed",
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully authenticated",
        data: { idToken },
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "[Internal Server Error] Failed to authenticate user",
        error: { message: e.message, stack: e.stack },
      }),
    };
  }
};
