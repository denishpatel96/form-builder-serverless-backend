import {
  CognitoIdentityProviderClient,
  UpdateUserAttributesCommandInput,
  UpdateUserAttributesCommand,
  InitiateAuthCommandInput,
  InitiateAuthCommand,
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
    const { email } = event.requestContext.authorizer?.jwt.claims;
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { password, accessToken, attributes } = body as {
      password?: string;
      accessToken?: string;
      attributes: { name: string; value: string }[];
    };

    let params: UpdateUserAttributesCommandInput;
    if (attributes.findIndex((atr) => atr.name === "email") !== -1) {
      if (!(password && attributes.length > 0)) {
        return {
          statusCode: 400,
          ...corsHeaders,
          body: JSON.stringify({
            message: "password and email attrubute to update required",
          }),
        };
      }
      const authenticateParams: InitiateAuthCommandInput = {
        ClientId: process.env.USER_POOL_CLIENT_ID,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      };
      const { AuthenticationResult } = await client.send(
        new InitiateAuthCommand(authenticateParams)
      );
      params = {
        UserAttributes: attributes.map((atr) => ({
          Name: atr.name,
          Value: atr.value,
        })),
        AccessToken: AuthenticationResult.AccessToken,
      };
    } else {
      if (!(accessToken && attributes.length > 0)) {
        return {
          statusCode: 400,
          ...corsHeaders,
          body: JSON.stringify({
            message: "accessToken and at least one attrubute to update required",
          }),
        };
      }
      params = {
        UserAttributes: attributes.map((atr) => ({
          Name: atr.name,
          Value: atr.value,
        })),
        AccessToken: accessToken,
      };
    }

    await client.send(new UpdateUserAttributesCommand(params));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "UpdateAttributes requested successfully!",
      }),
    };
  } catch (e) {
    if (e.name === "NotAuthorizedException") {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({ message: "Invalid password" }),
      };
    }
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack }),
    };
  }
};
