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

    if (!formId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "[Bad Request] No form id provided",
        }),
      };
    }

    const params: DeleteItemCommandInput = {
      TableName: process.env.FORMS_TABLE,
      Key: marshall({ formId }),
    };
    await db.send(new DeleteItemCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully deleted form",
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "[Internal Server Error] Failed to delete form",
        error: { message: e.message, stack: e.stack },
      }),
    };
  }
};
