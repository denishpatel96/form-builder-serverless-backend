import { DynamoDBClient, PutItemCommand, PutItemCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
import { v4 } from "uuid";

const db = new DynamoDBClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const dateString = new Date().toISOString();
    const formData = {
      ...body,
      id: v4(),
      createdAt: dateString,
      updatedAt: dateString,
    };

    const params: PutItemCommandInput = {
      TableName: process.env.FORMS_TABLE,
      Item: marshall(formData),
    };
    const createResult = await db.send(new PutItemCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully created form",
        data: createResult,
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "[Internal Server Error] Failed to create form",
        error: { message: e.message, stack: e.stack },
      }),
    };
  }
};
