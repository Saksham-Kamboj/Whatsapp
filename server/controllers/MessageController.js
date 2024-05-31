import getPrismaInstance from "../utils/PrismaClient.js";
import { renameSync } from "fs";

export const addMessage = async (req, res, next) => {
  try {
    const prisma = getPrismaInstance();
    const { message, from, to } = req.body;
    const getUser = onlineUsers.get(to);

    if (message && from && to) {
      const newMessage = await prisma.messages.create({
        data: {
          message,
          senderId: from,
          receiverId: to,
          messageStatus: getUser ? "delivered" : "sent",
        },
        include: { sender: true, receiver: true },
      });
      res.status(201).send({ message: newMessage });
    } else {
      res.status(400).send("From, to, and message are required");
    }
  } catch (error) {
    next(error);
    res.status(500).send("Internal server error");
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const prisma = getPrismaInstance();
    const { from, to } = req.params;

    const messages = await prisma.messages.findMany({
      where: {
        OR: [
          {
            senderId: from,
            receiverId: to,
          },
          {
            senderId: to,
            receiverId: from,
          },
        ],
      },
      orderBy: {
        id: "asc",
      },
    });

    const unreadMessages = [];

    messages.forEach((message, index) => {
      if (message.messageStatus !== "read" && message.senderId === to) {
        messages[index].messageStatus = "read";
        unreadMessages.push(message.id);
      }
    });

    await prisma.messages.updateMany({
      where: {
        id: {
          in: unreadMessages,
        },
      },
      data: {
        messageStatus: "read",
      },
    });
    res.status(200).json(messages);
  } catch (error) {
    next(error);
  }
};

export const addImageMessage = async (req, res, next) => {
  try {
    if (req.file) {
      const date = Date.now();
      let fileName = "uploads/images/" + date + req.file.originalname;
      renameSync(req.file.path, fileName);

      const prisma = getPrismaInstance();
      const { from, to } = req.query;
      const getUser = onlineUsers.get(to);

      if (from && to) {
        const message = await prisma.messages.create({
          data: {
            message: fileName,
            senderId: from,
            receiverId: to,
            type: "image",
            messageStatus: getUser ? "delivered" : "sent",
          },
        });
        res.status(201).json({ message });
      } else {
        res.status(400).send("From and to are required");
      }
    } else {
      res.status(400).send("Image is required");
    }
  } catch (error) {
    next(error);
  }
};

export const addAudioMessage = async (req, res, next) => {
  try {
    if (req.file) {
      const date = Date.now();
      let fileName = "uploads/recordings/" + date + req.file.originalname;
      renameSync(req.file.path, fileName);

      const prisma = getPrismaInstance();
      const { from, to } = req.query;
      const getUser = onlineUsers.get(to);

      if (from && to) {
        const message = await prisma.messages.create({
          data: {
            message: fileName,
            senderId: from,
            receiverId: to,
            type: "audio",
            messageStatus: getUser ? "delivered" : "sent",
          },
        });
        res.status(201).json({ message });
      } else {
        res.status(400).send("From and to are required");
      }
    } else {
      res.status(400).send("Audio is required");
    }
  } catch (error) {
    next(error);
  }
};

export const getInitialContactWithMessages = async (req, res, next) => {
  try {
    const userId = req.params.from;
    const prisma = getPrismaInstance();
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        sentMessages: {
          include: {
            receiver: true,
            sender: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        receivedMessages: {
          include: {
            receiver: true,
            sender: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });
    const messages = [...user.sentMessages, ...user.receivedMessages];
    messages.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const users = new Map();
    const messageStatusChange = [];

    messages.forEach((msg, index) => {
      const isSender = msg.senderId === userId;
      const calculatedId = isSender ? msg.receiverId : msg.senderId;
      if (msg.messageStatus === "sent") {
        messageStatusChange.push(msg.id);
      }
      const {
        id,
        type,
        message,
        messageStatus,
        createdAt,
        senderId,
        receiverId,
      } = msg;
      if (!users.get(calculatedId)) {
        let user = {
          messageId: id,
          type,
          message,
          messageStatus,
          createdAt,
          senderId,
          receiverId,
        };

        if (isSender) {
          user = {
            ...user,
            ...msg.receiver,
            totalUnreadMessages: 0,
          };
        } else {
          user = {
            ...user,
            ...msg.sender,
            totalUnreadMessages: messageStatus !== "read" ? 1 : 0,
          };
        }
        users.set(calculatedId, { ...user });
      } else if (messageStatus !== "read" && !isSender) {
        const user = users.get(calculatedId);
        users.set(calculatedId, {
          ...user,
          totalUnreadMessages: user.totalUnreadMessages + 1,
        });
      }
    });
    if (prisma.message) {
      if (messageStatusChange.length) {
        await prisma.message.updateMany({
          where: {
            id: {
              in: messageStatusChange,
            },
          },
          data: {
            messageStatus: "delivered",
          },
        });
      }
    } else {
      console.error("New message not available");
    }
    return res.status(200).json({
      users: Array.from(users.values()),
      onlineUsers: Array.from(onlineUsers.keys()), // Assuming onlineUsers is defined somewhere
    });
  } catch (error) {
    next(error);
  }
};