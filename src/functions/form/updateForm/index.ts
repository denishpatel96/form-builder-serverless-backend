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
    const { formId: id, ownerId, ...fieldsToUpdate } = body;

    const formId = event.pathParameters?.formId;
    if (!formId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: { message: "formId required as query parameter" },
        }),
      };
    }

    const userId = event.requestContext.authorizer?.claims.sub;

    const formData = {
      ...fieldsToUpdate,
      updatedAt: new Date().toISOString(),
    };
    const objKeys = Object.keys(formData);

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
          { ":userId": userId }
        )
      ),
      ConditionExpression: "ownerId = :userId",
    };

    await db.send(new UpdateItemCommand(params));

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
