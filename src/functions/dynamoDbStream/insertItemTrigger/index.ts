import {
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBStreamHandler } from "aws-lambda";

export const handler: DynamoDBStreamHandler = async (event, _context, _callback) => {
  const db = new DynamoDBClient({ region: process.env.REGION });
  for (let record of event.Records) {
    console.log("Stream record: ", JSON.stringify(record, null, 2));

    if (record.eventName == "INSERT") {
      var type = record.dynamodb.NewImage.type.S;
      if (type === "WS") {
        // if new workspace is added, then:
        // increment count of workspace,
        const orgId = record.dynamodb.NewImage.pk.S;
        const params: UpdateItemCommandInput = {
          TableName: process.env.FORM_BUILDER_DATA_TABLE,
          Key: marshall({ pk: orgId, sk: "A" }),
          UpdateExpression: `SET workspaceCount = if_not_exists(workspaceCount, :start) + :inc`,
          ExpressionAttributeValues: marshall({
            ":inc": 1,
            ":start": 0,
          }),
        };

        console.log("Updating workspace count...");
        try {
          await db.send(new UpdateItemCommand(params));
        } catch (error) {
          console.log("Error :", error);
        }
      }
    }
  }
};
