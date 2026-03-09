import { createContext, FC, ReactNode, useContext } from 'react';
import { useLiveAPI } from '../hooks/media/use-live-api';

// Create the context using the inferred return type of useLiveAPI
export type UseLiveAPIResults = ReturnType<typeof useLiveAPI>;

const LiveAPIContext = createContext<UseLiveAPIResults | undefined>(undefined);

export type LiveAPIProviderProps = {
  children: ReactNode;
  apiKey?: string;
};

export const LiveAPIProvider: FC<LiveAPIProviderProps> = ({
  apiKey,
  children,
}) => {
  const liveAPI = useLiveAPI(apiKey);

  return (
    <LiveAPIContext.Provider value={liveAPI}>
      {children}
    </LiveAPIContext.Provider>
  );
};

export const useLiveAPIContext = () => {
  const context = useContext(LiveAPIContext);
  if (!context) {
    throw new Error('useLiveAPIContext must be used within a LiveAPIProvider');
  }
  return context;
};
