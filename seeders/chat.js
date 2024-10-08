import { faker } from "@faker-js/faker";
import { Chat } from "../models/chat.js";
import { User } from "../models/user.js";
import { Message } from "../models/message.js";

const createSingleChats = async (numChats) => {
  try {
    const users = await User.find().select("_id");
    const chatPromise = [];

    for (let i = 0; i < numChats; i++) {
      for (let j = i + 1; j < numChats; j++) {
        chatPromise.push(
          Chat.create({
            name: faker.lorem.words(2),
            members: [users[i], users[j]],
          })
        );
      }
    }
    await Promise.all(chatPromise);
    console.log("chat Successfully created");
    process.exit();
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};
const createGroupChats = async (numChats) => {
  try {
    // Fetch users and select only their _id
    const users = await User.find().select("_id");
    const chatPromises = [];

    for (let i = 0; i < numChats; i++) {
      // Get a random number of members between 3 and the total number of users
      const numMembers = simpleFaker.number.int({ min: 3, max: users.length });
      const members = [];

      // Randomly select members ensuring no duplicates
      for (let j = 0; j < numMembers; j++) {
        const randomIndex = Math.floor(Math.random() * users.length);
        const randomUser = users[randomIndex]._id; // Use _id for comparison

        if (!members.includes(randomUser)) {
          members.push(randomUser); // Add the user's _id to the members array
        }
      }

      // Create the group chat with the selected members
      const chat = Chat.create({
        groupChat: true,
        name: faker.lorem.word(), // Generate a random name for the group chat
        members,
        creator: members[0], // The first member is the creator
      });

      chatPromises.push(chat);
    }

    // Wait for all the chat creations to complete
    await Promise.all(chatPromises);

    console.log(`${numChats} group chats successfully created.`);
    process.exit(); // Exit after success
  } catch (error) {
    console.error("Error creating group chats:", error);
    process.exit(1); // Exit with error code
  }
};

const createMessage = async (numMessages) => {
  try {
    const users = await User.find().select("_id");
    const chats = await Chat.find().select("_id");

    const messagePromise = [];
    for (let i = 0; i < numMessages; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const randoChat = users[Math.floor(Math.random() * chats.length)];
      messagePromise.push(
        Message.create({
          chat: randoChat,
          sender: randomUser,
          content: faker.lorem.sentence(),
        })
      );
    }
    await Promise.all(messagePromise);
    console.log("Message Created Successfully");
    process.exit();
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};
const createMessageInAChat = async (chatId, numMessages) => {
  try {
    const users = await User.find().select("_id");

    const messagePromise = [];
    for (let i = 0; i < numMessages; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];

      messagePromise.push(
        Message.create({
          chat: chatId,
          sender: randomUser,
          content: faker.lorem.sentence(),
        })
      );
    }
    await Promise.all(messagePromise);
    console.log("Message Created Successfully");
    process.exit();
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};
export {
  createGroupChats,
  createMessageInAChat,
  createSingleChats,
  createMessage,
};
