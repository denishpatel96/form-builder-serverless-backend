import {
  AttributeValue,
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
  BatchWriteItemOutput,
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
  WriteRequest,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBStreamHandler } from "aws-lambda";

export const handler: DynamoDBStreamHandler = async (event, _context, _callback) => {
  const db = new DynamoDBClient({ region: process.env.REGION });
  for (let record of event.Records) {
    console.log("Stream record: ", JSON.stringify(record, null, 2));

    try {
      // if form is deleted, then:
      // decrement count of form,
      const orgId = record.dynamodb.OldImage.orgId.S;
      const workspaceId = record.dynamodb.OldImage.workspaceId.S;

      console.log("Updating form count...");
      await db.send(
        new UpdateItemCommand({
          TableName: process.env.USERS_TABLE,
          Key: marshall({ userId: orgId }),
          UpdateExpression: `SET formCount = if_not_exists(formCount, :start) - :decrement`,
          ExpressionAttributeValues: marshall({
            ":decrement": 1,
            ":start": 1,
          }),
        })
      );

      await db.send(
        new UpdateItemCommand({
          TableName: process.env.WORKSPACES_TABLE,
          Key: marshall({ orgId, workspaceId }),
          UpdateExpression: `SET formCount = if_not_exists(formCount, :start) - :decrement`,
          ExpressionAttributeValues: marshall({
            ":decrement": 1,
            ":start": 1,
          }),
        })
      );

      // get all form related item
      const formId = record.dynamodb.OldImage.formId.S;
      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery1 = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const { Items, LastEvaluatedKey } = await db.send(
          new QueryCommand({
            TableName: process.env.FORM_RESPONSES_TABLE,
            ExclusiveStartKey: lastEvaluatedKey,
            KeyConditionExpression: "formId = :formId",
            ExpressionAttributeValues: marshall({
              ":formId": formId,
            }),
          })
        );
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery1(LastEvaluatedKey);
        }
      };
      await recursiveQuery1();
      const formResponsesToDelete = items.map((i) => unmarshall(i));

      items = [];
      const recursiveQuery2 = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const { Items, LastEvaluatedKey } = await db.send(
          new QueryCommand({
            TableName: process.env.FORM_FIELDS_TABLE,
            ExclusiveStartKey: lastEvaluatedKey,
            KeyConditionExpression: "formId = :formId",
            ExpressionAttributeValues: marshall({
              ":formId": formId,
            }),
          })
        );
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery2(LastEvaluatedKey);
        }
      };

      await recursiveQuery2();
      const formFieldsToDelete = items.map((i) => unmarshall(i));

      // batch delete all the data
      let requestItems = {
        [process.env.FORM_RESPONSES_TABLE]: formResponsesToDelete.map((i) => {
          return {
            DeleteRequest: {
              Key: marshall({
                formId: i.formId,
                responseId: i.responseId,
              }),
            },
          };
        }),
        [process.env.FORM_FIELDS_TABLE]: formFieldsToDelete.map((i) => {
          return {
            DeleteRequest: {
              Key: marshall({
                formId: i.formId,
                fieldId: i.fieldId,
              }),
            },
          };
        }),
      };
      const recursiveBatchWrite = async (requestItems?: Record<string, WriteRequest[]>) => {
        const bwParams: BatchWriteItemCommandInput = {
          RequestItems: requestItems,
        };
        console.log("Deleting form related items...");
        let response: BatchWriteItemOutput = await db.send(new BatchWriteItemCommand(bwParams));
        if (response && response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
          await recursiveBatchWrite(response.UnprocessedItems);
        }
      };

      await recursiveBatchWrite(requestItems);
    } catch (error) {
      console.log("Error :", error);
    }
  }
};
