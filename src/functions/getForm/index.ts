import { DynamoDBClient, GetItemCommand, GetItemCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
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

    const params: GetItemCommandInput = {
      TableName: process.env.FORMS_TABLE,
      Key: marshall({ formId }),
    };
    const { Item } = await db.send(new GetItemCommand(params));

    console.log({ Item });

    return {
      statusCode: 200,
      body: JSON.stringify(
        Item
          ? {
              message: "Successfully retrieved form",
              data: unmarshall(Item),
            }
          : {
              message: `No form found with provided id : ${formId} `,
              data: {},
            }
      ),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "[Internal Server Error] Failed to get form",
        error: { message: e.message, stack: e.stack },
      }),
    };
  }
};
