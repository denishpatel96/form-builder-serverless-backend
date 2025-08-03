import {
  InitiateAuthCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommandInput,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
  const client = new CognitoIdentityProviderClient({ region: process.env.REGION });
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { email, password, refreshToken } = body;
    if (!((email && password) || refreshToken)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({
          message: "email-password or refreshToken required",
        }),
      };
    }

    const authenticateParams: InitiateAuthCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
      AuthFlow: refreshToken ? "REFRESH_TOKEN_AUTH" : "USER_PASSWORD_AUTH",
      AuthParameters: refreshToken
        ? { REFRESH_TOKEN: refreshToken }
        : {
            USERNAME: email,
            PASSWORD: password,
          },
    };
    const response = await client.send(new InitiateAuthCommand(authenticateParams));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ content: response, message: "Authenticated successfully!" }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack }),
    };
  }
};
