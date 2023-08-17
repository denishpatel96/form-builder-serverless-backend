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
      const orgId = record.dynamodb.OldImage.orgId.S;
      const updateparams: UpdateItemCommandInput = {
        TableName: process.env.USERS_TABLE,
        Key: marshall({ id: orgId }),
        UpdateExpression: `SET workspaceCount = if_not_exists(workspaceCount, :start) - :decrement`,
        ExpressionAttributeValues: marshall({
          ":decrement": 1,
          ":start": 1,
        }),
      };

      console.log("Updating workspace count...");
      await db.send(new UpdateItemCommand(updateparams));

      // get all workspace related item
      const workspaceId = record.dynamodb.OldImage.workspaceId.S;
      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery1 = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.WORKSPACE_ROLES_TABLE,
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "workspaceId = :workspaceId",
          ExpressionAttributeValues: marshall({
            ":workspaceId": workspaceId,
          }),
        };
        const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery1(LastEvaluatedKey);
        }
      };
      await recursiveQuery1();
      const workspaceRolesToDelete = items.map((i) => unmarshall(i));

      items = [];
      const recursiveQuery2 = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.FORMS_TABLE,
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "workspaceId = :workspaceId",
          ExpressionAttributeValues: marshall({
            ":workspaceId": workspaceId,
          }),
        };
        const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery2(LastEvaluatedKey);
        }
      };

      await recursiveQuery2();
      const formsToDelete = items.map((i) => unmarshall(i));

      // batch delete all the data
      let requestItems = {
        [process.env.WORKSPACE_ROLES_TABLE]: workspaceRolesToDelete.map((i) => {
          return {
            DeleteRequest: {
              Key: marshall({
                workspaceId: i.workspaceId,
                userId: i.userId,
              }),
            },
          };
        }),
        [process.env.FORMS_TABLE]: formsToDelete.map((i) => {
          return {
            DeleteRequest: {
              Key: marshall({
                workspaceId: i.workspaceId,
                formId: i.formId,
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
