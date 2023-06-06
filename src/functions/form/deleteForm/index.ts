import {
  DeleteItemCommand,
  DeleteItemCommandInput,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const formId = event.pathParameters?.formId;
    const userId = event.requestContext.authorizer?.claims.sub;

    if (!formId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: { message: "formId required as path parameter" },
        }),
      };
    }

    const params: DeleteItemCommandInput = {
      TableName: process.env.FORMS_TABLE,
      Key: marshall({ id: formId }),
      ExpressionAttributeValues: marshall({ ":userId": userId }),
      ConditionExpression: "ownerId = :userId",
    };
    await db.send(new DeleteItemCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      body: JSON.stringify({
        success: false,
        error: { name: e.name, message: e.message, stack: e.stack },
      }),
    };
  }
};
