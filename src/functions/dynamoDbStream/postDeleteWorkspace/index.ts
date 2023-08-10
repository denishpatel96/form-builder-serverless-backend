import {
  AttributeValue,
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
  BatchWriteItemOutput,
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
  UpdateItemCommand,
  UpdateItemCommandInput,
  WriteRequest,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBStreamHandler } from "aws-lambda";

export const handler: DynamoDBStreamHandler = async (event, _context, _callback) => {
  const db = new DynamoDBClient({ region: process.env.REGION });
  for (let record of event.Records) {
    console.log("Stream record: ", JSON.stringify(record, null, 2));

    try {
      // if workspace is deleted, then:
      // decrement count of workspace,
      const orgId = record.dynamodb.OldImage.pk.S;
      const updateparams: UpdateItemCommandInput = {
        TableName: process.env.FORM_BUILDER_DATA_TABLE,
        Key: marshall({ pk: orgId, sk: "A" }),
        UpdateExpression: `SET workspaceCount = if_not_exists(workspaceCount, :start) - :decrement`,
        ExpressionAttributeValues: marshall({
          ":decrement": 1,
          ":start": 1,
        }),
      };

      console.log("Updating workspace count...");
      await db.send(new UpdateItemCommand(updateparams));

      // get all workspace related item
      const workspaceId = record.dynamodb.OldImage.sk.S;
      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.FORM_BUILDER_DATA_TABLE,
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: marshall({
            ":pk": workspaceId,
          }),
          ScanIndexForward: false,
        };
        const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery(LastEvaluatedKey);
        }
      };

      // batch delete all the data
      const itemsToDelete = items.map((i) => unmarshall(i));
      let requestItems = {
        [process.env.FORM_BUILDER_DATA_TABLE]: itemsToDelete.map((i) => {
          return {
            DeleteRequest: {
              Key: marshall({
                pk: i.pk,
                sk: i.sk,
              }),
            },
          };
        }),
      };
      const recursiveBatchWrite = async (requestItems?: Record<string, WriteRequest[]>) => {
        const bwParams: BatchWriteItemCommandInput = {
          RequestItems: requestItems,
        };
        console.log("Deleting workspace related items...");
        let response: BatchWriteItemOutput = await db.send(new BatchWriteItemCommand(bwParams));
        if (
          response &&
          response.UnprocessedItems &&
          Object.keys(response.UnprocessedItems).length > 0
        ) {
          await recursiveBatchWrite(response.UnprocessedItems);
        }
      };

      await recursiveBatchWrite(requestItems);
    } catch (error) {
      console.log("Error :", error);
    }
  }
};
