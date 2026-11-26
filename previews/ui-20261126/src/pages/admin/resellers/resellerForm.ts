export type ResellerForm = {
  username: string
  email: string
  password: string
  name: string
  contactName: string
  phone: string
  notes: string
}

export const initialForm: ResellerForm = {
  username: '',
  email: '',
  password: '',
  name: '',
  contactName: '',
  phone: '',
  notes: '',
}

export type ResellerPayload = {
  username: string
  email: string
  password: string
  name: string
  contact_name: string
  phone: string
  notes: string
}

export type BuiltReseller = { payload: ResellerPayload } | { error: string }

/** Validate the form and build the request body, so the dialog can show the message where the person is looking. */
export function buildResellerPayload(form: ResellerForm): BuiltReseller {
  if (!form.username.trim() || !form.password.trim() || !form.name.trim()) {
    return { error: '请填写用户名、密码和代理商名称' }
  }
  return {
    payload: {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim(),
      contact_name: form.contactName.trim(),
      phone: form.phone.trim(),
      notes: form.notes.trim(),
    },
  }
}
