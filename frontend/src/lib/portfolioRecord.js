const kinds={review:'reviews',finding:'findings',task:'tasks',risk:'risks'};

export async function loadPortfolioRecord(api,item) {
  const kind=kinds[item.entity_type], id=item.entity_id || item.id;
  if(!kind || !id || !item.client_id) throw new Error('This item cannot be opened. Refresh the portfolio and try again.');
  const {data}=await api.get(`/${kind}/${encodeURIComponent(id)}`);
  if(data.client_id!==item.client_id) throw new Error('Record belongs to another client.');
  return {kind,record:data};
}
