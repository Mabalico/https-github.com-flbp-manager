import React from 'react';
type Props={x:number;children?:React.ReactNode};
type State={y:number};
class A extends React.Component<Props, State>{
  declare props: Readonly<Props>;
  declare setState: (state: State | Partial<State> | ((prevState: Readonly<State>, props: Readonly<Props>) => State | Partial<State> | null) | null, callback?: () => void) => void;
  state={y:1};
  render(){ return <div>{this.props.x}{this.state.y}</div>; }
  foo(){ this.setState({y:2}); }
}
