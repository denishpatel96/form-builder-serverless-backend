import * as fs from "fs";
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
import { SES, SendEmailCommandInput, SendEmailCommand } from "@aws-sdk/client-ses";
const db = new DynamoDBClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { orgId, accepted } = body;

    const {
      email,
      "cognito:username": claimedUsername,
      given_name: firstName,
      family_name: lastName,
    } = event.requestContext.authorizer?.jwt.claims;

    if (!orgId) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId are required" }),
      };
    }

    // Check if there is any invitaiton with mentioned orgId and email in database.
    console.log("Checking if invitation exists or not..");
    const { Item } = await db.send(
      new GetItemCommand({
        TableName: process.env.ORG_MEMBER_INVITATIONS_TABLE,
        Key: marshall({ orgId, email }),
      })
    );
    if (!Item) {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({ message: "no invitation exists with provided orgId." }),
      };
    }
    const invitation = Item ? unmarshall(Item) : null;

    // Check if user accepted the invitation or not.
    // If Yes, Add user to members table and send email
    // If no, just send email

    if (accepted) {
      console.log("Adding user as organization member..");
      // create org member entry in db
      const dateString = new Date().toISOString();
      await db.send(
        new PutItemCommand({
          TableName: process.env.ORG_MEMBERS_TABLE,
          Item: marshall({
            orgId,
            userId: claimedUsername,
            role: invitation.role,
            createdBy: invitation.inviter.userId,
            createdAt: dateString,
            updatedAt: dateString,
            firstName,
            lastName,
            email,
            orgName: invitation.inviter.orgName,
          }),
          ConditionExpression: "attribute_not_exists(orgId)",
        })
      );
    }

    // Delete invitation from the database
    console.log("Deleting invitation..");
    await db.send(
      new DeleteItemCommand({
        TableName: process.env.ORG_MEMBER_INVITATIONS_TABLE,
        Key: marshall({ orgId, email }),
      })
    );

    // send email

    const dirPath = process.env.LAMBDA_TASK_ROOT
      ? process.env.LAMBDA_TASK_ROOT + "/dist/orgMemberInvitation/respondToOrgMemberInvitation/"
      : __dirname;

    const inviter = invitation.inviter;
    const role = invitation.role;
    const inviterName = inviter.firstName;
    const orgName = inviter.orgName;
    const inviterEmail = inviter.email;
    const response = accepted ? "accepted" : "declined";
    let template = fs.readFileSync(dirPath + "orgMemberInvitationResponseEmail.html", "utf8");
    template = template.replace(/\$ORG\$/g, orgName);
    template = template.replace(/\$INVITER\$/g, inviterName);
    template = template.replace(/\$INVITER_EMAIL\$/g, inviterEmail);
    template = template.replace(/\$EMAIL\$/g, email);
    template = template.replace(/\$ROLE\$/g, role);
    template = template.replace(/\$RESPONSE\$/g, response);
    await sendEmail(inviterEmail, `Invitation you sent was ${response}`, template);

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "Invitation response submitted successfully!",
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack }),
    };
  }
};

const sendEmail = async (to: string, subject: string, body: string) => {
  const ses = new SES({ region: process.env.REGION });
  const params: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Body: {
        Html: {
          Data: body,
          Charset: "UTF-8",
        },
      },
      Subject: {
        Data: subject,
      },
    },
    Source: "vTwinsForm <denish@vtwinsform.com>",
  };
  try {
    await ses.send(new SendEmailCommand(params));
  } catch (err) {
    console.log(err);
  }
};
