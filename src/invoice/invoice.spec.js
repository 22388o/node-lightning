const Invoice = require('./invoice');
const crypto = require('crypto');
const bs58check = require('bs58check');

const sha256 = crypto.createHash('sha256');
sha256.update(
  'One piece of chocolate cake, one icecream cone, one pickle, one slice of swiss cheese, one slice of salami, one lollypop, one piece of cherry pie, one sausage, one cupcake, and one slice of watermelon'
);
const hashDescription = sha256.digest();

test('test vector 1', () => {
  let input =
    'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w';
  let result = Invoice.deserialize(input);
  expect(result.timestamp).toBe(1496314658);
  expect(result.data[0].type).toBe(1);
  expect(result.data[0].data).toEqual(
    Buffer.from('0001020304050607080900010203040506070809000102030405060708090102', 'hex')
  );
  expect(result.data[1].type).toBe(13);
  expect(result.data[1].data).toEqual('Please consider supporting this project');
  expect(result.signature).toEqual(
    Buffer.from(
      '38ec6891345e204145be8a3a99de38e98a39d6a569434e1845c8af7205afcfcc7f425fcd1463e93c32881ead0d6e356d467ec8c02553f9aab15e5738b11f127f00',
      'hex'
    )
  );
});

test('test vector 2', () => {
  let input =
    'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';
  let result = Invoice.deserialize(input);
  expect(result.timestamp).toBe(1496314658);

  expect(result.data.length).toBe(3);

  expect(result.data[0].type).toBe(1);
  expect(result.data[0].data).toEqual(
    Buffer.from('0001020304050607080900010203040506070809000102030405060708090102', 'hex')
  );

  expect(result.data[1].type).toBe(13);
  expect(result.data[1].data).toBe('1 cup coffee');

  expect(result.data[2].type).toBe(6);
  expect(result.data[2].data).toBe(60);

  expect(result.signature).toEqual(
    Buffer.from(
      'e89639ba6814e36689d4b91bf125f10351b55da057b00647a8dabaeb8a90c95f160f9d5a6e0f79d1fc2b964238b944e2fa4aa677c6f020d466472ab842bd750e00',
      'hex'
    )
  );
});

test('test vector 3', () => {
  let input =
    'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpquwpc4curk03c9wlrswe78q4eyqc7d8d0xqzpuyk0sg5g70me25alkluzd2x62aysf2pyy8edtjeevuv4p2d5p76r4zkmneet7uvyakky2zr4cusd45tftc9c5fh0nnqpnl2jfll544esqchsrny';
  let result = Invoice.deserialize(input);
  expect(result.timestamp).toBe(1496314658);

  expect(result.data.length).toBe(3);

  expect(result.data[0].type).toBe(1);
  expect(result.data[0].data).toEqual(
    Buffer.from('0001020304050607080900010203040506070809000102030405060708090102', 'hex')
  );

  expect(result.data[1].type).toBe(13);
  expect(result.data[1].data).toBe('ナンセンス 1杯');

  expect(result.data[2].type).toBe(6);
  expect(result.data[2].data).toBe(60);

  expect(result.signature).toEqual(
    Buffer.from(
      '259f04511e7ef2aa77f6ff04d51b4ae9209504843e5ab9672ce32a153681f687515b73ce57ee309db588a10eb8e41b5a2d2bc17144ddf398033faa49ffe95ae600',
      'hex'
    )
  );
});

test('test vector 4', () => {
  let input =
    'lnbc20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqscc6gd6ql3jrc5yzme8v4ntcewwz5cnw92tz0pc8qcuufvq7khhr8wpald05e92xw006sq94mg8v2ndf4sefvf9sygkshp5zfem29trqq2yxxz7';
  let result = Invoice.deserialize(input);
  expect(result.timestamp).toBe(1496314658);

  expect(result.data.length).toBe(2);

  expect(result.data[0].type).toBe(1);
  expect(result.data[0].data).toEqual(
    Buffer.from('0001020304050607080900010203040506070809000102030405060708090102', 'hex')
  );

  expect(result.data[1].type).toBe(23);
  expect(result.data[1].data).toEqual(hashDescription);

  expect(result.signature).toEqual(
    Buffer.from(
      'c63486e81f8c878a105bc9d959af1973854c4dc552c4f0e0e0c7389603d6bdc67707bf6be992a8ce7bf50016bb41d8a9b5358652c4960445a170d049ced4558c00',
      'hex'
    )
  );
});

test('test vector 5', () => {
  let input =
    'lntb20m1pvjluezhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqfpp3x9et2e20v6pu37c5d9vax37wxq72un98kmzzhznpurw9sgl2v0nklu2g4d0keph5t7tj9tcqd8rexnd07ux4uv2cjvcqwaxgj7v4uwn5wmypjd5n69z2xm3xgksg28nwht7f6zspwp3f9t';

  let result = Invoice.deserialize(input);

  expect(result.timestamp).toBe(1496314658);

  expect(result.data.length).toBe(3);

  expect(result.data[0].type).toBe(23);
  expect(result.data[0].data).toEqual(hashDescription);

  expect(result.data[1].type).toBe(1);
  expect(result.data[1].data).toEqual(
    Buffer.from('0001020304050607080900010203040506070809000102030405060708090102', 'hex')
  );
});

test('test vector 6', () => {
  let input =
    'lnbc20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqsfpp3qjmp7lwpagxun9pygexvgpjdc4jdj85fr9yq20q82gphp2nflc7jtzrcazrra7wwgzxqc8u7754cdlpfrmccae92qgzqvzq2ps8pqqqqqqpqqqqq9qqqvpeuqafqxu92d8lr6fvg0r5gv0heeeqgcrqlnm6jhphu9y00rrhy4grqszsvpcgpy9qqqqqqgqqqqq7qqzqj9n4evl6mr5aj9f58zp6fyjzup6ywn3x6sk8akg5v4tgn2q8g4fhx05wf6juaxu9760yp46454gpg5mtzgerlzezqcqvjnhjh8z3g2qqdhhwkj';

  let result = Invoice.deserialize(input);

  expect(result.timestamp).toBe(1496314658);
  expect(result.data.length).toBe(4);

  expect(result.data[0].type).toBe(1);
  expect(result.data[0].data).toEqual(
    Buffer.from('0001020304050607080900010203040506070809000102030405060708090102', 'hex')
  );

  expect(result.data[1].type).toBe(23);
  expect(result.data[1].data).toEqual(hashDescription);

  expect(result.data[2].type).toBe(9);
  expect(result.data[2].data.version).toBe(17);
  expect(result.data[2].data.address).toEqual(
    bs58check.decode('1RustyRX2oai4EYYDpQGWvEL62BBGqN9T')
  );

  expect(result.data[3].type).toBe(3);
  expect(result.data[3].data[0].pubkey).toEqual(
    Buffer.from('029e03a901b85534ff1e92c43c74431f7ce72046060fcf7a95c37e148f78c77255', 'hex')
  );
  expect(result.data[3].data[0].short_channel_id).toEqual(Buffer.from('0102030405060708', 'hex'));
  expect(result.data[3].data[0].fee_base_msat).toBe(1);
  expect(result.data[3].data[0].fee_proportional_millionths).toBe(20);
  expect(result.data[3].data[0].cltv_expiry_delta).toBe(3);

  expect(result.data[3].data[1].pubkey).toEqual(
    Buffer.from('039e03a901b85534ff1e92c43c74431f7ce72046060fcf7a95c37e148f78c77255', 'hex')
  );
  expect(result.data[3].data[1].short_channel_id).toEqual(Buffer.from('030405060708090a', 'hex'));
  expect(result.data[3].data[1].fee_base_msat).toBe(2);
  expect(result.data[3].data[1].fee_proportional_millionths).toBe(30);
  expect(result.data[3].data[1].cltv_expiry_delta).toBe(4);

  expect(result.signature).toEqual(
    Buffer.from(
      '91675cb3fad8e9d915343883a49242e074474e26d42c7ed914655689a8074553733e8e4ea5ce9b85f69e40d755a55014536b12323f8b220600c94ef2b9c5142800',
      'hex'
    )
  );
});

test('on mainnet, with fallback (P2SH) address 3EktnHQD7RiAE6uzMj2ZifT9YgRrkSgzQX', () => {
  let input =
    'lnbc20m1pvjluezhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqfppj3a24vwu6r8ejrss3axul8rxldph2q7z9kmrgvr7xlaqm47apw3d48zm203kzcq357a4ls9al2ea73r8jcceyjtya6fu5wzzpe50zrge6ulk4nvjcpxlekvmxl6qcs9j3tz0469gq5g658y';
  let result = Invoice.deserialize(input);
});
