// Older Reviews saved one flat mapping. New Reviews store each program's mappings on its own driver.
export function activeReviewMappings(review) {
  return (review.framework_drivers ?? [review]).filter(driver =>
    driver?.framework_key && driver.framework_driver_active !== false && driver.framework_safeguards?.length);
}

export function reviewMapsTo(review, key, definitionId) {
  return activeReviewMappings(review).some(driver =>
    driver.framework_key === key && driver.framework_safeguards.includes(definitionId));
}
