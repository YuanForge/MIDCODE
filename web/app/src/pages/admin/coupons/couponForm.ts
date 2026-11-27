export type CouponForm = {
  code: string
  title: string
  discount_type: string
  discount_value: string
  min_amount: string
  max_discount: string
  total_count: string
  per_user_limit: string
  valid_from: string
  valid_until: string
}

export const initialCouponForm: CouponForm = {
  code: '',
  title: '',
  discount_type: 'fixed',
  discount_value: '',
  min_amount: '',
  max_discount: '',
  total_count: '',
  per_user_limit: '1',
  valid_from: '',
  valid_until: '',
}

/** Amounts are typed in yuan and sent in fen. */
export function toCouponPayload(form: CouponForm) {
  return {
    ...form,
    discount_value: form.discount_value ? parseFloat(form.discount_value) * 100 : undefined,
    min_amount: form.min_amount ? parseFloat(form.min_amount) * 100 : undefined,
    max_discount: form.max_discount ? parseFloat(form.max_discount) * 100 : undefined,
    total_count: form.total_count ? parseInt(form.total_count, 10) : undefined,
    per_user_limit: parseInt(form.per_user_limit, 10),
  }
}
