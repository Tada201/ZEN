import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Session, ChatFolder } from "../../components/chat/types";
import { mapChatToSession, mapChatFolderToFolder } from "./useChatQueries";

export function useChatMutations({
  currentSessionId,
  setCurrentSessionId,
  sessions,
  archivedSessions,
  selectedModelId,
}: {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  sessions: Session[];
  archivedSessions: Session[];
  selectedModelId: string;
}) {
  const queryClient = useQueryClient();

  const createSessionMutation = useMutation({
    mutationFn: (title?: string) => invoke<any>("create_chat", { 
      title: title || "New Case", 
      model: selectedModelId === "No Model" ? null : selectedModelId 
    }),
    onSuccess: (chat) => {
      console.log("[useChat] Session created successfully:", chat);
      const session = mapChatToSession(chat);
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => [session, ...(prev || [])]);
      setCurrentSessionId(session.id);
    },
    onError: (err) => {
      console.error("[useChat] Failed to create session:", err);
      toast.error("Failed to create session");
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("delete_chat", { chatId: id }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => prev?.filter((s) => s.id !== id));
      queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => prev?.filter((s) => s.id !== id));
      if (currentSessionId === id) setCurrentSessionId(null);
      toast.success("Session deleted");
    },
    onError: () => toast.error("Failed to delete session"),
  });

  const renameSessionMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => invoke("update_chat_title", { chatId: id, title }),
    onSuccess: (_, { id, title }) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === id ? { ...s, title } : s)
      );
      toast.success("Session renamed");
    }
  });

  const pinSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("toggle_pin_chat", { chatId: id }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s)
      );
    }
  });

  const archiveSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("archive_chat", { chatId: id }),
    onSuccess: (_, id) => {
      const session = sessions.find(s => s.id === id);
      if (session) {
        queryClient.setQueryData<Session[]>(["sessions"], (prev) => prev?.filter(s => s.id !== id));
        queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => [{ ...session, archived: true }, ...(prev || [])]);
      }
      if (currentSessionId === id) setCurrentSessionId(null);
      toast.success("Session archived");
    }
  });

  const unarchiveSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("unarchive_chat", { chatId: id }),
    onSuccess: (_, id) => {
      const session = archivedSessions.find(s => s.id === id);
      if (session) {
        queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => prev?.filter(s => s.id !== id));
        queryClient.setQueryData<Session[]>(["sessions"], (prev) => [{ ...session, archived: false }, ...(prev || [])]);
      }
      toast.success("Session unarchived");
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => invoke("bulk_delete_chats", { chatIds: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["archived-sessions"] });
      toast.success("History cleared");
    }
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => invoke<any>("create_chat_folder", { name }),
    onSuccess: (folder) => {
      queryClient.setQueryData<ChatFolder[]>(["folders"], (prev) => [mapChatFolderToFolder(folder), ...(prev || [])]);
    }
  });

  const moveChatToFolderMutation = useMutation({
    mutationFn: ({ chatId, folderId }: { chatId: string; folderId: string | null }) => 
      folderId 
        ? invoke("move_chat_to_folder", { chatId, folderId })
        : invoke("remove_chat_from_folder", { chatId }),
    onSuccess: (_, { chatId, folderId }) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === chatId ? { ...s, folderId } : s)
      );
    }
  });

  return {
    handleCreateSession: async (title?: string | any): Promise<string> => {
      const cleanTitle = typeof title === "string" ? title : undefined;
      const chat = await createSessionMutation.mutateAsync(cleanTitle);
      return chat.id;
    },
    handleDeleteSession: (id: string) => deleteSessionMutation.mutate(id),
    handleRenameSession: (id: string, title: string) => renameSessionMutation.mutate({ id, title }),
    handlePinSession: (id: string) => pinSessionMutation.mutate(id),
    handleArchiveSession: (id: string) => archiveSessionMutation.mutate(id),
    handleUnarchiveSession: (id: string) => unarchiveSessionMutation.mutate(id),
    handleDeleteAll: () => bulkDeleteMutation.mutate(sessions.map(s => s.id)),
    handleCreateFolder: (name: string) => createFolderMutation.mutate(name),
    handleMoveToFolder: (chatId: string, folderId: string | null) => moveChatToFolderMutation.mutate({ chatId, folderId }),
  };
}
