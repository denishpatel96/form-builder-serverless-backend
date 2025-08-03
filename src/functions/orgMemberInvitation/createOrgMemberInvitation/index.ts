import * as fs from "fs";
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { SES, SendEmailCommandInput, SendEmailCommand } from "@aws-sdk/client-ses";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
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
    const { orgId, email, role } = body;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && email)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId and email are required" }),
      };
    }

    // Get inviting user record
    const { Item } = await db.send(
      new GetItemCommand(
        orgId === claimedUsername
          ? {
              TableName: process.env.USERS_TABLE,
              Key: marshall({
                userId: claimedUsername,
              }),
            }
          : {
              TableName: process.env.ORG_MEMBERS_TABLE,
              Key: marshall({
                orgId: orgId,
                userId: claimedUsername,
              }),
            }
      )
    );
    const inviter = Item ? unmarshall(Item) : null;

    if (claimedUsername !== orgId && !(inviter && inviter.role === "Admin")) {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({
          message: "You are not authorized to invite a member to this organization.",
        }),
      };
    }

    // Check if invitee exists in record
    //  If Yes, check whether invitee is already a member or not
    //    If Yes, throw error.
    //    If No, proceed.
    //  If No, proceed.
    const { Items } = await db.send(
      new QueryCommand({
        TableName: process.env.USERS_TABLE,
        IndexName: "email-index",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: marshall({
          ":email": email,
        }),
      })
    );

    if (Items && Items.length > 0) {
      const invitee = unmarshall(Items[0]);
      const { Item: existingMember } = await db.send(
        new GetItemCommand({
          TableName: process.env.ORG_MEMBERS_TABLE,
          Key: marshall({
            orgId: orgId,
            userId: invitee.userId,
          }),
        })
      );
      if (existingMember) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "Member with similar email already exists in the organization.",
          }),
        };
      }
    }

    // create invitation entry in db
    await db.send(
      new PutItemCommand({
        TableName: process.env.ORG_MEMBER_INVITATIONS_TABLE,
        Item: marshall({
          orgId,
          email,
          role,
          inviter: inviter,
          createdAt: new Date().toISOString(),
        }),
      })
    );

    // send email

    const dirPath = process.env.LAMBDA_TASK_ROOT
      ? process.env.LAMBDA_TASK_ROOT + "/dist/orgMemberInvitation/createOrgMemberInvitation/"
      : __dirname;

    const url = process.env.STAGE === "prod" ? "https://BrownLama.com" : "http://localhost:3000";
    const link = url + `/login`;
    const inviterName = `${inviter.firstName} ${inviter.lastName}`;
    const orgName = inviter.orgName;
    const inviterEmail = inviter.email;
    const permissions =
      role === "Admin"
        ? `
    <ul>
    <li> Can view, add and remove organization members</li>
    <li> Can view and add workspaces</li>
    <li> Can't delete workspaces without owner permissions</li>
    <li> Can view and edit billing plan</li>
    </ul>
    `
        : `
    <ul>
    <li> Can view and add workspaces</li>
    <li> Can't delete workspaces without owner permissions</li>
    </ul>
    `;
    let template = fs.readFileSync(dirPath + "orgMemberInvitationEmail.html", "utf8");
    template = template.replace(/\$ORG\$/g, orgName);
    template = template.replace(/\$INVITER\$/g, inviterName);
    template = template.replace(/\$INVITER_EMAIL\$/g, inviterEmail);
    template = template.replace(/\$EMAIL\$/g, email);
    template = template.replace(/\$ROLE\$/g, role);
    template = template.replace(/\$PERMISSIONS\$/g, permissions);
    template = template.replace(/\$LINK\$/g, link);
    await sendEmail(email, `You're invited to collaborate on BrownLama`, template);

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "Member invited successfully!",
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({
        name: e.name,
        message: e.message,
        stack: e.stack,
      }),
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
    Source: "BrownLama <denish@BrownLama.com>",
  };
  try {
    await ses.send(new SendEmailCommand(params));
  } catch (err) {
    console.log(err);
  }
};
