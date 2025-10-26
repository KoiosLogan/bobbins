import React from 'react';
import { useNavigate } from 'react-router-dom';
import ChatDesktopView from '../features/chat/components/ChatDesktopView';
import { useChatController } from '../features/chat/hooks/useChatController';

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const controller = useChatController({
    navigate: (path: string) => navigate(path),
  });

  return <ChatDesktopView controller={controller} />;
};

export default ChatPage;
