import {
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { formId, ...fieldsToUpdate } = body;
    if (!formId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "[Bad Request] No form id provided",
        }),
      };
    }

    const formData = {
      ...fieldsToUpdate,
      updatedAt: new Date().toISOString(),
    };
    const objKeys = Object.keys(formData);

    if (!formId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "[Bad Request] No form id provided",
        }),
      };
    }

    const params: UpdateItemCommandInput = {
      TableName: process.env.FORMS_TABLE,
      Key: marshall({ id: formId }),
      UpdateExpression: `SET ${objKeys.map((_, index) => `#key${index} = :value${index}`)}`,
      ExpressionAttributeNames: objKeys.reduce(
        (acc, key, index) => ({ ...acc, [`#key${index}`]: key }),
        {}
      ),
      ExpressionAttributeValues: marshall(
        objKeys.reduce(
          (acc, key, index) => ({
            ...acc,
            [`:value${index}`]: formData[key],
          }),
          {}
        )
      ),
    };
    await db.send(new UpdateItemCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully updated form",
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "[Internal Server Error] Failed to update form",
        error: { message: e.message, stack: e.stack },
      }),
    };
  }
};
