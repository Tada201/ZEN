import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi, getIpcErrorMessage } from "@/api";
import { useChatStore } from "@/lib/stores/useChatStore";
import { toast } from "sonner";
import { Session, ChatFolder } from "../../components/chat/types";
import { mapChatToSession, mapChatFolderToFolder } from "./useChatQueries";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";

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
    mutationFn: (input?: string | { title?: string; workspaceRoot?: string | null }) => {
      const title = typeof input === "string" ? input : input?.title;
      const workspaceRoot = typeof input === "string"
        ? useSettingsStore.getState().workspacePath
        : input?.workspaceRoot ?? useSettingsStore.getState().workspacePath;
      return chatApi.createChat(
        title || "New Case",
        selectedModelId === "No Model" ? null : selectedModelId,
        workspaceRoot || null,
      );
    },
    onSuccess: (chat) => {
      const session = mapChatToSession(chat);
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => [session, ...(prev || [])]);
      setCurrentSessionId(session.id);
    },
    onError: (err) => {
      console.error("[useChat] Failed to create session:", err);
      toast.error(getIpcErrorMessage(err, "Failed to create session"));
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => chatApi.deleteChat(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => prev?.filter((s) => s.id !== id));
      queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => prev?.filter((s) => s.id !== id));
      useChatStore.getState().clearSessionRuntime(id);
      if (currentSessionId === id) {
        // Auto-select the next available session instead of leaving a blank chat.
        const remaining = sessions.filter((s) => s.id !== id);
        setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast.success("Session deleted");
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to delete session")),
  });

  const renameSessionMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => chatApi.updateChatTitle(id, title),
    onSuccess: (_, { id, title }) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === id ? { ...s, title } : s)
      );
      toast.success("Session renamed");
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to rename session")),
  });

  const pinSessionMutation = useMutation({
    mutationFn: (id: string) => chatApi.togglePinChat(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s)
      );
    }
  });

  const archiveSessionMutation = useMutation({
    mutationFn: (id: string) => chatApi.archiveChat(id),
    onSuccess: (_, id) => {
      const session = sessions.find(s => s.id === id);
      if (session) {
        queryClient.setQueryData<Session[]>(["sessions"], (prev) => prev?.filter(s => s.id !== id));
        queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => [{ ...session, archived: true }, ...(prev || [])]);
      }
      if (currentSessionId === id) {
        // Auto-select the next available session instead of leaving a blank chat.
        const remaining = sessions.filter((s) => s.id !== id);
        setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast.success("Session archived");
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to archive session")),
  });

  const unarchiveSessionMutation = useMutation({
    mutationFn: (id: string) => chatApi.unarchiveChat(id),
    onSuccess: (_, id) => {
      const session = archivedSessions.find(s => s.id === id);
      if (session) {
        queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => prev?.filter(s => s.id !== id));
        queryClient.setQueryData<Session[]>(["sessions"], (prev) => [{ ...session, archived: false }, ...(prev || [])]);
      }
      toast.success("Session unarchived");
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to unarchive session")),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => chatApi.bulkDeleteChats(ids),
    onSuccess: (_, ids) => {
      ids.forEach((id) => useChatStore.getState().clearSessionRuntime(id));
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["archived-sessions"] });
      toast.success("History cleared");
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to clear history")),
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => chatApi.createFolder(name),
    onSuccess: (folder) => {
      queryClient.setQueryData<ChatFolder[]>(["folders"], (prev) => [mapChatFolderToFolder(folder), ...(prev || [])]);
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to create folder")),
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) =>
      chatApi.updateFolder(folderId, name),
    onSuccess: (_, { folderId, name }) => {
      queryClient.setQueryData<ChatFolder[]>(["folders"], (prev) =>
        prev?.map((f) => (f.id === folderId ? { ...f, name } : f))
      );
      toast.success("Folder renamed");
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to rename folder")),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => chatApi.deleteFolder(folderId),
    onSuccess: (_, folderId) => {
      queryClient.setQueryData<ChatFolder[]>(["folders"], (prev) => prev?.filter((f) => f.id !== folderId));
      // Clear folderId on both active and archived session projections.
      queryClient.setQueryData<Session[]>(["sessions"], (prev) =>
        prev?.map((s) => (s.folderId === folderId ? { ...s, folderId: null } : s))
      );
      queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) =>
        prev?.map((s) => (s.folderId === folderId ? { ...s, folderId: null } : s))
      );
      toast.success("Folder deleted");
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to delete folder")),
  });

  const setSessionWorkspaceMutation = useMutation({
    mutationFn: async ({ chatId, workspaceRoot }: { chatId: string; workspaceRoot: string | null }) => {
      // Only legacy chats without a captured root can be assigned one. New
      // chats receive their canonical root during creation.
      const session = [...sessions, ...archivedSessions].find((item) => item.id === chatId);
      if (session?.workspaceRoot) {
        throw new Error("Chat workspace is immutable after initialization");
      }
      if (!workspaceRoot?.trim()) {
        throw new Error("A workspace root is required for a legacy chat");
      }
      return chatApi.setChatWorkspace(chatId, workspaceRoot);
    },
    onSuccess: (chat) => {
      const session = mapChatToSession(chat);
      queryClient.setQueryData<Session[]>(["sessions"], (prev) =>
        prev?.map((item) => (item.id === session.id ? { ...item, workspaceRoot: session.workspaceRoot, updatedAt: session.updatedAt } : item))
      );
      queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) =>
        prev?.map((item) => (item.id === session.id ? { ...item, workspaceRoot: session.workspaceRoot, updatedAt: session.updatedAt } : item))
      );
      toast.success(session.workspaceRoot ? "Session workspace updated" : "Session now follows the global workspace");
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to update session workspace")),
  });

  const moveChatToFolderMutation = useMutation({
    mutationFn: ({ chatId, folderId }: { chatId: string; folderId: string | null }) => 
      folderId 
        ? chatApi.moveChatToFolder(chatId, folderId)
        : chatApi.removeChatFromFolder(chatId),
    onSuccess: (_, { chatId, folderId }) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === chatId ? { ...s, folderId } : s)
      );
      queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) =>
        prev?.map(s => s.id === chatId ? { ...s, folderId } : s)
      );
    },
    onError: (err) => toast.error(getIpcErrorMessage(err, "Failed to move chat")),
  });

  return {
    handleCreateSession: async (input?: string | { title?: string; workspaceRoot?: string | null }): Promise<string> => {
      const chat = await createSessionMutation.mutateAsync(input);
      return chat.id;
    },
    handleDeleteSession: (id: string) => deleteSessionMutation.mutate(id),
    handleRenameSession: (id: string, title: string) => renameSessionMutation.mutate({ id, title }),
    handlePinSession: (id: string) => pinSessionMutation.mutate(id),
    handleArchiveSession: (id: string) => archiveSessionMutation.mutate(id),
    handleUnarchiveSession: (id: string) => unarchiveSessionMutation.mutate(id),
    handleDeleteAll: () => bulkDeleteMutation.mutate(sessions.map(s => s.id)),
    handleCreateFolder: (name: string) => createFolderMutation.mutate(name),
    handleRenameFolder: (folderId: string, name: string) =>
      renameFolderMutation.mutate({ folderId, name }),
    handleDeleteFolder: (folderId: string) => deleteFolderMutation.mutate(folderId),
    handleMoveToFolder: (chatId: string, folderId: string | null) => moveChatToFolderMutation.mutate({ chatId, folderId }),
    handleSetSessionWorkspace: (chatId: string, workspaceRoot: string | null) =>
      setSessionWorkspaceMutation.mutate({ chatId, workspaceRoot }),
  };
}
