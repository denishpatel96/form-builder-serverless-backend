import {
  CognitoIdentityProviderClient,
  VerifyUserAttributeCommand,
  VerifyUserAttributeCommandInput,
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
    const { accessToken, attributeName, code } = body as {
      accessToken: string;
      attributeName: string;
      code: string;
    };

    if (!(accessToken && attributeName && code)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({
          message: "accessToken, attributeName and code required",
        }),
      };
    }

    const params: VerifyUserAttributeCommandInput = {
      AttributeName: attributeName,
      AccessToken: accessToken,
      Code: code,
    };
    await client.send(new VerifyUserAttributeCommand(params));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: `${attributeName} verified successfully!`,
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
