import { FormGroup } from '@/components/shared/FormGroup'
import { TextField } from '@/components/shared/TextField'
import type { ChannelForm } from '@/pages/admin/channels/channelForm'
import { AreaField, Opts, SelectField, type SetField } from '@/pages/admin/channels/fields'

/** Scripts that map requests and responses, and the polling setup for asynchronous tasks. */
export function ScriptsTab({ form, set }: { form: ChannelForm; set: SetField }) {
  return (
    <div className='flex flex-col gap-6'>
      <FormGroup title='转换脚本'>
        <AreaField id='channel-request-script' label='入参脚本' hint='mapRequest(input) → 将平台请求映射为上游格式。' value={form.request_script} onChange={(value) => set('request_script', value)} rows={7} />
        <AreaField id='channel-response-script' label='出参脚本' hint='mapResponse(input) → 映射上游响应，或提取 upstream_task_id（异步）。' value={form.response_script} onChange={(value) => set('response_script', value)} rows={7} />
        <AreaField id='channel-error-script' label='错误检测脚本' hint='checkError(response) → 返回非空字符串表示错误，null/false 表示正常。' value={form.error_script} onChange={(value) => set('error_script', value)} rows={5} />
      </FormGroup>

      <FormGroup title='轮询（异步任务用）'>
        <TextField id='channel-query-url' wide label='轮询 URL' value={form.query_url} onChange={(value) => set('query_url', value)} placeholder='如 https://api.example.com/v1/tasks/{id}' />
        <SelectField id='channel-query-method' label='轮询方法' value={form.query_method} onChange={(value) => set('query_method', value)}>
          <Opts items={['GET', 'POST']} />
        </SelectField>
        <TextField id='channel-query-timeout' label='轮询超时（ms）' value={form.query_timeout_ms} onChange={(value) => set('query_timeout_ms', value)} />
        <AreaField id='channel-query-script' label='轮询脚本' hint='mapResponse(input) → 将轮询响应映射为标准格式。' value={form.query_script} onChange={(value) => set('query_script', value)} rows={7} />
      </FormGroup>
    </div>
  )
}
