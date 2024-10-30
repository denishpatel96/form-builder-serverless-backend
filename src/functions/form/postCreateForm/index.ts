import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBStreamHandler } from "aws-lambda";

export const handler: DynamoDBStreamHandler = async (event, _context, _callback) => {
  const db = new DynamoDBClient({ region: process.env.REGION });
  for (let record of event.Records) {
    console.log("Stream record: ", JSON.stringify(record, null, 2));

    // if new form is added, then:
    // increment count of form,
    const orgId = record.dynamodb.NewImage.orgId.S;
    const workspaceId = record.dynamodb.NewImage.workspaceId.S;

    console.log("Updating form count...");
    try {
      // update count of form in user table
      await db.send(
        new UpdateItemCommand({
          TableName: process.env.USERS_TABLE,
          Key: marshall({ userId: orgId }),
          UpdateExpression: `SET formCount = if_not_exists(formCount, :start) + :inc`,
          ExpressionAttributeValues: marshall({
            ":inc": 1,
            ":start": 0,
          }),
        })
      );

      // update count of form in workspace table
      await db.send(
        new UpdateItemCommand({
          TableName: process.env.WORKSPACES_TABLE,
          Key: marshall({ orgId, workspaceId }),
          UpdateExpression: `SET formCount = if_not_exists(formCount, :start) + :inc`,
          ExpressionAttributeValues: marshall({
            ":inc": 1,
            ":start": 0,
          }),
        })
      );
    } catch (error) {
      console.log("Error :", error);
    }
  }
};
