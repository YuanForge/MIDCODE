import { PageHeader } from '@/components/shared/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ChatThread, Composer } from '@/pages/user/playground/ChatPanel'
import { ChatParamsPanel, ConversationList } from '@/pages/user/playground/ChatSidebar'
import { ModelBar } from '@/pages/user/playground/ModelBar'
import { usePlayground } from '@/pages/user/playground/usePlayground'

/**
 * Text playground (ledger): the key and model on top, the transcript and composer on the left, and the
 * parameters and saved conversations in a ruled column on the right. On a phone the column moves below the chat.
 */
export function UserPlaygroundPage() {
  const chat = usePlayground()
  const sendDisabled = !chat.streaming && (!chat.inputText.trim() || !chat.keyUsable || chat.channels.length === 0)

  return (
    <>
      <PageHeader
        title='文本对话'
        description='选择模型，开始文本对话。'
        actions={
          <Button disabled={chat.streaming} onClick={() => void chat.newConversation()}>
            新对话
          </Button>
        }
      />
      {chat.error ? (
        <Alert variant='destructive'>
          <AlertDescription>{chat.error}</AlertDescription>
        </Alert>
      ) : null}

      <ModelBar
        apiKeys={chat.apiKeys}
        channels={chat.channels}
        keyId={chat.selectedKeyId}
        channelId={chat.selectedChannelId}
        onKey={chat.setSelectedKeyId}
        onChannel={chat.setSelectedChannelId}
      />

      <div className='grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]'>
        <div className='glass flex h-[68dvh] min-h-[440px] min-w-0 flex-col p-4'>
          <ChatThread messages={chat.messages} streaming={chat.streaming} streamingText={chat.streamingText} />
          <Composer
            value={chat.inputText}
            onChange={chat.setInputText}
            onSend={() => void chat.sendMessage()}
            onStop={chat.stop}
            streaming={chat.streaming}
            sendDisabled={sendDisabled}
            keyUnavailable={chat.apiKeys.length > 0 && !chat.keyUsable}
          />
        </div>
        <aside className='flex min-w-0 flex-col gap-8 xl:sticky xl:top-6'>
          <ChatParamsPanel params={chat.params} onChange={chat.updateParams} />
          <ConversationList
            items={chat.conversations}
            currentId={chat.currentConvId}
            disabled={chat.streaming}
            onOpen={chat.openConversation}
            onDelete={(id) => void chat.deleteConversation(id)}
            onRefresh={() => void chat.loadConversations()}
          />
        </aside>
      </div>
    </>
  )
}
