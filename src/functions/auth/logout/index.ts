import {
  CognitoIdentityProviderClient,
  RevokeTokenCommand,
  RevokeTokenCommandInput,
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
    const { token } = body;
    if (!token) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "token required" }),
      };
    }

    const params: RevokeTokenCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Token: token,
    };
    await client.send(new RevokeTokenCommand(params));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "Token revoked successfully!",
      }),
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
