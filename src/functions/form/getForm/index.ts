import { DynamoDBClient, GetItemCommand, GetItemCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
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

    const params: GetItemCommandInput = {
      TableName: process.env.FORMS_TABLE,
      Key: marshall({ id: formId }),
    };
    const { Item } = await db.send(new GetItemCommand(params));

    // If form belongs to someone else or not found at all, return NOT FOUND.
    const formData = Item ? unmarshall(Item) : {};
    if (!Item || formData.ownerId !== userId) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: { message: "No form found with provided formId" },
        }),
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: formData,
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
